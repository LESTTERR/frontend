import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export default function ThreeMapViewer({ modelPath = "/models/och-building.glb" }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const mountElement = mountRef.current;

    if (!mountElement) {
      return undefined;
    }

    let frameId = 0;
    let loadedModel = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe9e3);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    camera.position.set(7, 5, 7);

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

        loadedModel.position.sub(center);
        loadedModel.scale.setScalar(scale);
        scene.add(loadedModel);

        controls.target.set(0, 0, 0);
        camera.position.set(7, 5, 7);
        controls.update();
        setStatus("ready");
      },
      undefined,
      () => {
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
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();

      if (loadedModel) {
        loadedModel.traverse((child) => {
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
