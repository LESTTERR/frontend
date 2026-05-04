import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function clampPercent(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0.5;
  }

  return THREE.MathUtils.clamp(numberValue, 0, 100) / 100;
}

function getFloorRatio(floor = "") {
  const normalizedFloor = floor.toLowerCase();

  if (normalizedFloor.includes("ground")) {
    return 0.18;
  }

  if (normalizedFloor.includes("2")) {
    return 0.68;
  }

  if (normalizedFloor.includes("1")) {
    return 0.44;
  }

  return 0.5;
}

function getOfficeFocusPosition(office, bounds) {
  if (!office || !bounds) {
    return null;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const mapPosition = office.mapPosition ?? { x: 50, y: 50 };
  const xRatio = clampPercent(mapPosition.x);
  const zRatio = clampPercent(mapPosition.y);
  const floorRatio = getFloorRatio(office.floor);

  return new THREE.Vector3(
    bounds.min.x + size.x * xRatio,
    bounds.min.y + size.y * floorRatio,
    bounds.max.z - size.z * zRatio,
  );
}

function getCameraOffset(bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  const largestSide = Math.max(size.x, size.y, size.z) || 7;

  return new THREE.Vector3(
    largestSide * 0.82,
    largestSide * 0.54,
    largestSide * 0.9,
  );
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

export default function ThreeMapViewer({
  modelPath = "/models/och-building.glb",
  selectedOffice,
  viewCommand,
}) {
  const mountRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const focusAnimationRef = useRef(null);
  const focusMarkerRef = useRef(null);
  const modelBoundsRef = useRef(null);
  const selectedOfficeRef = useRef(selectedOffice);
  const [status, setStatus] = useState("loading");

  function animateView(target, cameraPosition, instant = false) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!camera || !controls) {
      return;
    }

    if (focusAnimationRef.current) {
      window.cancelAnimationFrame(focusAnimationRef.current);
      focusAnimationRef.current = null;
    }

    if (instant) {
      camera.position.copy(cameraPosition);
      controls.target.copy(target);
      controls.update();
      return;
    }

    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const startedAt = window.performance.now();
    const duration = 850;

    function step(now) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = easeInOutCubic(progress);

      camera.position.lerpVectors(startPosition, cameraPosition, easedProgress);
      controls.target.lerpVectors(startTarget, target, easedProgress);
      controls.update();

      if (progress < 1) {
        focusAnimationRef.current = window.requestAnimationFrame(step);
      } else {
        focusAnimationRef.current = null;
      }
    }

    focusAnimationRef.current = window.requestAnimationFrame(step);
  }

  function setFocusMarker(position) {
    const marker = focusMarkerRef.current;

    if (!marker) {
      return;
    }

    marker.position.copy(position);
    marker.visible = true;
  }

  function focusOffice(office, instant = false) {
    const bounds = modelBoundsRef.current;
    const focusPosition = getOfficeFocusPosition(office, bounds);

    if (!focusPosition || !bounds) {
      return;
    }

    setFocusMarker(focusPosition);
    animateView(focusPosition, focusPosition.clone().add(getCameraOffset(bounds)), instant);
  }

  function resetModelView(instant = false) {
    const bounds = modelBoundsRef.current;

    if (!bounds) {
      return;
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const offset = getCameraOffset(bounds).multiplyScalar(1.55);

    animateView(center, center.clone().add(offset), instant);
  }

  useEffect(() => {
    selectedOfficeRef.current = selectedOffice;

    if (selectedOffice) {
      focusOffice(selectedOffice);
    }
  }, [selectedOffice?.id]);

  useEffect(() => {
    if (!viewCommand) {
      return;
    }

    if (viewCommand.type === "reset-view") {
      resetModelView();
      return;
    }

    if (viewCommand.type === "focus-office") {
      focusOffice(selectedOfficeRef.current);
    }
  }, [viewCommand?.sequence]);

  useEffect(() => {
    const mountElement = mountRef.current;

    if (!mountElement) {
      return undefined;
    }

    let frameId = 0;
    let loadedModel = null;
    let isDisposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe9e3);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    camera.position.set(7, 5, 7);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountElement.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2;
    controls.maxDistance = 40;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const focusMarker = new THREE.Group();
    focusMarker.visible = false;

    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0xb94d44,
      emissive: 0x7a211d,
      emissiveIntensity: 0.22,
      metalness: 0.08,
      roughness: 0.35,
    });
    const markerRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xb94d44,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    });

    const markerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.29, 48),
      markerRingMaterial,
    );
    markerRing.rotation.x = -Math.PI / 2;

    const markerStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.26, 16),
      markerMaterial,
    );
    markerStem.position.y = 0.13;

    const markerDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 24, 16),
      markerMaterial,
    );
    markerDot.position.y = 0.3;

    focusMarker.add(markerRing, markerStem, markerDot);
    scene.add(focusMarker);
    focusMarkerRef.current = focusMarker;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(8, 12, 8);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
    fillLight.position.set(-7, 6, -6);
    scene.add(fillLight);

    function resizeRenderer() {
      const width = mountElement.clientWidth || 1;
      const height = mountElement.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(mountElement);
    resizeRenderer();

    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        if (isDisposed) {
          return;
        }

        loadedModel = gltf.scene;

        loadedModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const bounds = new THREE.Box3().setFromObject(loadedModel);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestSide = Math.max(size.x, size.y, size.z) || 1;
        const scale = 7 / largestSide;

        loadedModel.scale.setScalar(scale);
        loadedModel.position.sub(center.multiplyScalar(scale));
        scene.add(loadedModel);

        loadedModel.updateMatrixWorld(true);
        modelBoundsRef.current = new THREE.Box3().setFromObject(loadedModel);

        setStatus("ready");
        resetModelView(true);

        if (selectedOfficeRef.current) {
          focusOffice(selectedOfficeRef.current, true);
        }
      },
      undefined,
      () => {
        if (isDisposed) {
          return;
        }

        setStatus("error");
      }
    );

    function animate() {
      frameId = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    animate();

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(frameId);
      if (focusAnimationRef.current) {
        window.cancelAnimationFrame(focusAnimationRef.current);
      }
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();

      if (loadedModel) {
        disposeObject(loadedModel);
      }

      disposeObject(focusMarker);
      cameraRef.current = null;
      controlsRef.current = null;
      focusMarkerRef.current = null;
      modelBoundsRef.current = null;
      focusAnimationRef.current = null;
    };
  }, [modelPath]);

  return (
    <div className="three-viewer" ref={mountRef}>
      {status === "loading" ? (
        <div className="viewer-status">Loading Olongapo City Hall model...</div>
      ) : null}
      {status === "error" ? (
        <div className="viewer-status error">Unable to load 3D model.</div>
      ) : null}
    </div>
  );
}
