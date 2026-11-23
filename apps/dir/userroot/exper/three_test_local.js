import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

document.addEventListener('DOMContentLoaded', () => {

    const scene = new THREE.Scene();

    const canvas = document.getElementById("myCanvas");
    const camera = new THREE.PerspectiveCamera( 45, canvas.width / canvas.height, 0.1, 1000 );

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas,
        alpha: true
    });

    const webcam = document.getElementById("myVideo");
    const cameraStatus = document.getElementById("cameraStatus");
    const modelStatus = document.getElementById("modelStatus");

    async function startWebcam() {
        if (!navigator.mediaDevices?.getUserMedia) {
            cameraStatus.textContent = "Камера недоступна. Відкрийте сторінку через HTTPS або localhost.";
            return;
        }

        try {
            webcam.srcObject = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            await webcam.play();
            cameraStatus.textContent = "";
        } catch (error) {
            cameraStatus.textContent = `Не вдалося отримати доступ до камери: ${error.message}`;
        }
    }

    startWebcam();

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(2, 3, 4);
    scene.add(directionalLight);

    const pathmodel = "../assets/alien_11.obj";
    new OBJLoader().load(
        pathmodel,
        (model) => {
            const bounds = new THREE.Box3().setFromObject(model);
            const center = bounds.getCenter(new THREE.Vector3());
            const size = bounds.getSize(new THREE.Vector3());
            const maxDimension = Math.max(size.x, size.y, size.z);

            model.position.sub(center);
            model.scale.setScalar(2 / maxDimension);
            scene.add(model);
            model.position.y = 0;
            model.position.x = 2;
            model.rotation.x = -Math.PI;

            const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
            const verticalFov = THREE.MathUtils.degToRad(camera.fov);
            const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
            camera.position.set(0, 0, sphere.radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.15);
            camera.lookAt(0, 0, 0);
            modelStatus.textContent = "";
        },
        undefined,
        (error) => {
            modelStatus.textContent = `Не вдалося завантажити 3D-модель: ${error.message}`;
        }
    );

    function animate( time ) {
        renderer.render( scene, camera );
    }

    renderer.setAnimationLoop( animate );

});
