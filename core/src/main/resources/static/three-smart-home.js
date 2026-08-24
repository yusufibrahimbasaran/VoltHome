// VoltHome 3D WebGL Eco-Smart Architecture & Interactive Engine
// Uses Three.js & OrbitControls for rich, modern, daylight & natural visualization

let scene, camera, renderer, orbitControls;
let characterMesh = null;
let characterType = "ROBOT";
let weatherMode = "SUNNY";
let isFpsMode = false;
let rainParticles = null;
let roomLights = [];
let interactiveAppliances = [];
let raycaster, mouse;
let moveState = { forward: false, backward: false, left: false, right: false };
let fpsEuler = new THREE.Euler(0, 0, 0, 'YXZ');
let isInitialized = false;

window.initThreeSmartHome = function() {
    const container = document.getElementById("canvas-3d-container");
    if (!container) return;

    if (isInitialized && renderer) {
        onWindowResize();
        return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 560;

    // 1. Scene Setup - Natural Bright Daylight Tone
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xF0F4F8);
    scene.fog = new THREE.FogExp2(0xF0F4F8, 0.015);

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(22, 26, 26);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Orbit Controls
    if (typeof THREE.OrbitControls !== "undefined") {
        orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;
        orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
        orbitControls.target.set(0, 1, 0);
    }

    // 5. Natural Daylight Lighting
    setupNaturalLighting();

    // 6. Build Eco Home Structure & Rooms
    buildModernEcoHouse();

    // 7. Interactive Appliances & Sensors
    buildInteractiveAppliances();

    // 8. Create Character Avatar
    createCharacterAvatar();

    // 9. Raycasting Setup for Clicks
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener("click", onCanvasClick, false);
    window.addEventListener("resize", onWindowResize, false);
    setupKeyboardListeners();

    isInitialized = true;
    animate();
};

function setupNaturalLighting() {
    // Soft Ambient Daylight
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    // Natural Sunlight
    const sunLight = new THREE.DirectionalLight(0xfffaed, 0.85);
    sunLight.position.set(25, 45, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;
    const d = 25;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    // Room Point Lights (Soft warm interior glow for Night mode)
    const roomPositions = [
        { x: -5, y: 3.5, z: -5, color: 0xfff4e6 }, // Salon
        { x: 5, y: 3.5, z: -5, color: 0xffedd5 },  // Mutfak
        { x: -5, y: 3.5, z: 5, color: 0xfef3c7 },  // Yatak Odası
        { x: 5, y: 3.5, z: 5, color: 0xe0f2fe }    // Banyo
    ];

    roomLights = [];
    roomPositions.forEach(pos => {
        const light = new THREE.PointLight(pos.color, 0.2, 12);
        light.position.set(pos.x, pos.y, pos.z);
        scene.add(light);
        roomLights.push(light);
    });
}

function buildModernEcoHouse() {
    // Outer Garden / Patio Terrace Ground
    const gardenGeo = new THREE.PlaneGeometry(50, 50);
    const gardenMat = new THREE.MeshStandardMaterial({ 
        color: 0xdcfce7, 
        roughness: 0.9, 
        metalness: 0.05 
    });
    const garden = new THREE.Mesh(gardenGeo, gardenMat);
    garden.rotation.x = -Math.PI / 2;
    garden.position.y = -0.05;
    garden.receiveShadow = true;
    scene.add(garden);

    // Scandinavian Natural Light Oak Parquet Floor
    const floorGeo = new THREE.BoxGeometry(20, 0.2, 20);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0xe2d4be,
        roughness: 0.6,
        metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    scene.add(floor);

    // Modern Low Wall Material (Soft Warm White)
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.05
    });

    const createWall = (w, h, d, x, y, z) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const wall = new THREE.Mesh(geo, wallMat);
        wall.position.set(x, y, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
    };

    const wallHeight = 2.0;
    const wallY = wallHeight / 2;

    // Exterior Low Boundary Walls
    createWall(20.4, wallHeight, 0.3, 0, wallY, -10.1); // Arka Duvar
    createWall(0.3, wallHeight, 20.4, -10.1, wallY, 0); // Sol Duvar
    createWall(0.3, wallHeight, 20.4, 10.1, wallY, 0);  // Sağ Duvar
    createWall(6.0, wallHeight, 0.3, -7.0, wallY, 10.1); // Ön Duvar Sol
    createWall(6.0, wallHeight, 0.3, 7.0, wallY, 10.1);  // Ön Duvar Sağ (Kapı boşluğu ortada)

    // Interior Room Partitions
    createWall(20.0, wallHeight, 0.2, 0, wallY, 0);     // Yatay Bölme
    createWall(0.2, wallHeight, 8.5, 0, wallY, -5.7);   // Üst Dikey Bölme (Salon / Mutfak)
    createWall(0.2, wallHeight, 8.5, 0, wallY, 5.7);    // Alt Dikey Bölme (Yatak Odası / Banyo)
}

function buildInteractiveAppliances() {
    interactiveAppliances = [];

    // Modern Minimalist Appliance Models
    const items = [
        {
            name: "Akıllı Klima (AC)",
            room: "Salon",
            pos: [-5, 2.2, -9.7],
            size: [2.2, 0.6, 0.4],
            color: 0xf8fafc,
            wattage: "1850 W",
            applianceId: 1,
            isOn: true
        },
        {
            name: "Eco Akıllı Buzdolabı",
            room: "Mutfak",
            pos: [8.5, 1.4, -8.5],
            size: [1.2, 2.8, 1.2],
            color: 0x94a3b8,
            wattage: "210 W",
            applianceId: 2,
            isOn: true
        },
        {
            name: "Eco Çamaşır Makinesi",
            room: "Banyo",
            pos: [8.5, 0.8, 8.5],
            size: [1.1, 1.6, 1.1],
            color: 0xffffff,
            wattage: "1200 W",
            applianceId: 3,
            isOn: false
        },
        {
            name: "Akıllı Termostat & Isıtıcı",
            room: "Yatak Odası",
            pos: [-8.5, 0.8, 8.5],
            size: [1.8, 0.9, 0.3],
            color: 0x64748b,
            wattage: "1500 W",
            applianceId: 4,
            isOn: true
        }
    ];

    items.forEach(item => {
        const group = new THREE.Group();
        group.position.set(item.pos[0], item.pos[1], item.pos[2]);

        // Main Body
        const geo = new THREE.BoxGeometry(item.size[0], item.size[1], item.size[2]);
        const mat = new THREE.MeshStandardMaterial({
            color: item.color,
            metalness: 0.3,
            roughness: 0.4
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        // Soft Green Status Indicator Ring
        const ringGeo = new THREE.RingGeometry(0.12, 0.22, 16);
        const ringMat = new THREE.MeshBasicMaterial({
            color: item.isOn ? 0x10b981 : 0x94a3b8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0.1, item.size[2] / 2 + 0.01);
        group.add(ring);

        group.userData = {
            name: item.name,
            room: item.room,
            wattage: item.wattage,
            applianceId: item.applianceId,
            isOn: item.isOn,
            ringMesh: ring
        };

        scene.add(group);
        interactiveAppliances.push(group);
    });
}

function createCharacterAvatar() {
    if (characterMesh) {
        scene.remove(characterMesh);
    }

    const group = new THREE.Group();
    group.position.set(0, 0, 5);

    let skinColor = 0xf5d0b5;
    let clothColor = 0x059669;
    let headScale = 1.0;
    let bodyHeight = 1.2;

    if (characterType === "ROBOT") {
        skinColor = 0xd1d5db;
        clothColor = 0x0284c7;
    } else if (characterType === "CHILD") {
        bodyHeight = 0.8;
        headScale = 0.8;
        clothColor = 0xd97706;
    } else if (characterType === "WOMAN") {
        clothColor = 0x7c3aed;
    }

    // Character Body
    const bodyGeo = new THREE.CylinderGeometry(0.28, 0.32, bodyHeight, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = bodyHeight / 2 + 0.3;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.24 * headScale, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = bodyHeight + 0.45;
    head.castShadow = true;
    group.add(head);

    characterMesh = group;
    scene.add(characterMesh);
}

// ─── INTERACTION & CONTROLS ──────────────────────────────────────────────────

function onCanvasClick(event) {
    const container = document.getElementById("canvas-3d-container");
    if (!container) return;

    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const checkObjects = [];
    interactiveAppliances.forEach(group => {
        group.traverse(child => {
            if (child.isMesh) {
                child.userData.parentGroup = group;
                checkObjects.push(child);
            }
        });
    });

    const intersects = raycaster.intersectObjects(checkObjects);
    if (intersects.length > 0) {
        const hit = intersects[0].object.userData.parentGroup;
        if (hit && hit.userData) {
            toggleApplianceState(hit);
        }
    }
}

function toggleApplianceState(applianceGroup) {
    const data = applianceGroup.userData;
    data.isOn = !data.isOn;

    if (data.ringMesh) {
        data.ringMesh.material.color.setHex(data.isOn ? 0x10b981 : 0x94a3b8);
    }

    if (window.handle3dApplianceToggle) {
        window.handle3dApplianceToggle(data.applianceId, !data.isOn, data.name);
    } else if (window.showToast) {
        window.showToast(
            "3D Cihaz Kontrolü",
            `${data.name} ${data.isOn ? 'açıldı (ON)' : 'kapatıldı (OFF)'}.`,
            data.isOn ? "success" : "warning"
        );
    }
}

window.setCharacterType = function(type) {
    characterType = type;
    createCharacterAvatar();
};

window.setWeatherMode = function(mode) {
    weatherMode = mode;

    if (mode === "SUNNY") {
        scene.background.setHex(0xF0F4F8);
        scene.fog.color.setHex(0xF0F4F8);
        roomLights.forEach(l => l.intensity = 0.2);
        removeRain();
    } else if (mode === "NIGHT") {
        scene.background.setHex(0x1E293B);
        scene.fog.color.setHex(0x1E293B);
        roomLights.forEach(l => l.intensity = 1.4);
        removeRain();
    } else if (mode === "RAIN") {
        scene.background.setHex(0xCBD5E1);
        scene.fog.color.setHex(0xCBD5E1);
        roomLights.forEach(l => l.intensity = 0.5);
        createRain();
    }
};

function createRain() {
    if (rainParticles) return;
    const rainGeo = new THREE.BufferGeometry();
    const count = 1200;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 35;
        positions[i + 1] = Math.random() * 25;
        positions[i + 2] = (Math.random() - 0.5) * 35;
    }

    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rainMat = new THREE.PointsMaterial({
        color: 0x94a3b8,
        size: 0.12,
        transparent: true,
        opacity: 0.7
    });

    rainParticles = new THREE.Points(rainGeo, rainMat);
    scene.add(rainParticles);
}

function removeRain() {
    if (rainParticles) {
        scene.remove(rainParticles);
        rainParticles = null;
    }
}

window.toggleFpsMode = function() {
    isFpsMode = !isFpsMode;
    const btn = document.getElementById("btn-toggle-fps");
    const hud = document.getElementById("fps-hud-instructions");

    if (isFpsMode) {
        if (btn) btn.innerHTML = `<i class="fa-solid fa-camera"></i> Kuş Bakışı Moduna Dön`;
        if (hud) hud.classList.remove("hidden");
        if (orbitControls) orbitControls.enabled = false;
        if (characterMesh) {
            camera.position.set(characterMesh.position.x, 1.6, characterMesh.position.z);
        }
    } else {
        if (btn) btn.innerHTML = `<i class="fa-solid fa-person-walking"></i> FPS Modu (Karakter Gözü)`;
        if (hud) hud.classList.add("hidden");
        if (orbitControls) {
            orbitControls.enabled = true;
            camera.position.set(22, 26, 26);
            orbitControls.target.set(0, 1, 0);
        }
    }
};

function setupKeyboardListeners() {
    window.addEventListener("keydown", (e) => {
        if (!isFpsMode) return;
        switch (e.code) {
            case "KeyW": case "ArrowUp": moveState.forward = true; break;
            case "KeyS": case "ArrowDown": moveState.backward = true; break;
            case "KeyA": case "ArrowLeft": moveState.left = true; break;
            case "KeyD": case "ArrowRight": moveState.right = true; break;
        }
    });

    window.addEventListener("keyup", (e) => {
        if (!isFpsMode) return;
        switch (e.code) {
            case "KeyW": case "ArrowUp": moveState.forward = false; break;
            case "KeyS": case "ArrowDown": moveState.backward = false; break;
            case "KeyA": case "ArrowLeft": moveState.left = false; break;
            case "KeyD": case "ArrowRight": moveState.right = false; break;
        }
    });
}

function updateMovement(delta) {
    if (!isFpsMode || !characterMesh) return;

    const speed = 6.0 * delta;
    const moveVector = new THREE.Vector3();

    if (moveState.forward) moveVector.z -= 1;
    if (moveState.backward) moveVector.z += 1;
    if (moveState.left) moveVector.x -= 1;
    if (moveState.right) moveVector.x += 1;

    if (moveVector.lengthSq() > 0) {
        moveVector.normalize();
        characterMesh.position.x += moveVector.x * speed;
        characterMesh.position.z += moveVector.z * speed;

        characterMesh.position.x = Math.max(-9.0, Math.min(9.0, characterMesh.position.x));
        characterMesh.position.z = Math.max(-9.0, Math.min(9.0, characterMesh.position.z));

        camera.position.x = characterMesh.position.x;
        camera.position.z = characterMesh.position.z;
    }
}

function onWindowResize() {
    const container = document.getElementById("canvas-3d-container");
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 560;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - lastTime) / 1000;
    lastTime = time;

    updateMovement(delta);

    // Rain Particle Falling Animation
    if (rainParticles) {
        const positions = rainParticles.geometry.attributes.position.array;
        for (let i = 1; i < positions.length; i += 3) {
            positions[i] -= 18 * delta;
            if (positions[i] < 0) positions[i] = 25;
        }
        rainParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (orbitControls && orbitControls.enabled) {
        orbitControls.update();
    }

    renderer.render(scene, camera);
}
