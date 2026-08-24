// VoltHome 3D Interactive Smart Home & Simulation Engine (Three.js WebGL)
let scene, camera, renderer, orbitControls;
let is3DInitialized = false;
let isFpsMode = false;
let selectedCharacter = "ROBOT"; // ROBOT, MAN, WOMAN, CHILD
let currentWeather = "SUNNY";    // SUNNY, NIGHT, RAIN
let rainParticles = null;
let roomLights = [];
let interactiveObjects = []; // 3D appliances mesh targets
let characterMesh = null;
let animationFrameId = null;

// FPS Movement State
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
const fpsVelocity = { x: 0, z: 0 };
const moveSpeed = 0.12;

// Initialize 3D Simulation
window.initThreeSmartHome = function() {
    const container = document.getElementById("canvas-3d-container");
    if (!container || is3DInitialized) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 520;

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0d14);
    scene.fog = new THREE.FogExp2(0x0c0d14, 0.02);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(16, 18, 20);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Orbit Controls
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.maxPolarAngle = Math.PI / 2.1; // Don't go underground
    orbitControls.target.set(0, 0, 0);

    // 5. Build Smart Home Architecture
    buildSmartHomeRooms();
    buildEnvironmentLighting();
    buildCharacterAvatar();
    buildRainParticles();

    // 6. Setup Event Listeners
    setup3DEventListeners(container);

    is3DInitialized = true;
    animate();

    // Window resize handler
    window.addEventListener("resize", onWindowResize);
};

function onWindowResize() {
    const container = document.getElementById("canvas-3d-container");
    if (!container || !renderer || !camera) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// ─── 3D HOUSE & ROOM ARCHITECTURE ─────────────────────────────────────────────

function buildSmartHomeRooms() {
    // 1. Foundation / Ground Floor
    const floorGeo = new THREE.PlaneGeometry(24, 20);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x1a1c29,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid Floor Overlay
    const gridHelper = new THREE.GridHelper(24, 24, 0x00e5ff, 0x222538);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // 2. Room Partitions & Walls (Salon, Mutfak, Yatak Odası, Banyo)
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x25283b,
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85
    });

    // Outer Walls (Low cut for Isometric view)
    createWall(0, 1.2, -10, 24, 2.4, 0.4, wallMat); // Back Wall
    createWall(-12, 1.2, 0, 0.4, 2.4, 20, wallMat); // Left Wall
    createWall(12, 1.2, 0, 0.4, 2.4, 20, wallMat);  // Right Wall
    createWall(0, 1.2, 10, 24, 2.4, 0.4, wallMat);  // Front Wall (Low)

    // Interior Dividers
    createWall(0, 1.2, 0, 24, 2.4, 0.3, wallMat);   // Horizontal Divider
    createWall(-2, 1.2, -5, 0.3, 2.4, 10, wallMat); // Vertical Divider Top
    createWall(3, 1.2, 5, 0.3, 2.4, 10, wallMat);   // Vertical Divider Bottom

    // 3. Room Labels & Furniture
    addRoomArea("SALON", -6, 5, 0x00e5ff);
    addRoomArea("MUTFAK", 7, 5, 0xffaa00);
    addRoomArea("YATAK ODASI", -7, -5, 0xbb6bff);
    addRoomArea("BANYO & ÇAMAŞIR", 5, -5, 0x00e676);

    // 4. Place 3D Interactive IoT Appliances
    // Klima in Salon
    create3DAppliance("Klima (AC)", "AC", -6, 2.0, 1.0, 0x00e5ff, 2000);
    // Televizyon in Salon
    create3DAppliance("Televizyon", "TELEVISION", -9, 0.8, 5.0, 0x00e5ff, 150);
    // Buzdolabı in Mutfak
    create3DAppliance("Buzdolabı", "REFRIGERATOR", 9, 1.2, 3.0, 0x00e676, 300);
    // Fırın & Ocak in Mutfak
    create3DAppliance("Elektrikli Fırın", "HEATER", 6, 0.8, 8.0, 0xffaa00, 2200);
    // Çamaşır Makinesi in Banyo
    create3DAppliance("Çamaşır Makinesi", "WASHING_MACHINE", 7, 0.8, -5.0, 0xbb6bff, 1500);
    // Isıtıcı in Yatak Odası
    create3DAppliance("Yatak Odası Isıtıcı", "HEATER", -7, 0.8, -6.0, 0xff5500, 1800);
}

function createWall(x, y, z, w, h, d, mat) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
}

function addRoomArea(name, x, z, color) {
    // Room Area Indicator Light
    const light = new THREE.PointLight(color, 0.8, 10);
    light.position.set(x, 2.5, z);
    scene.add(light);
    roomLights.push(light);
}

// ─── INTERACTIVE 3D IOT APPLIANCES ───────────────────────────────────────────

function create3DAppliance(name, type, x, y, z, color, defaultWatt) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    let geo;
    if (type === "AC") geo = new THREE.BoxGeometry(1.6, 0.5, 0.4);
    else if (type === "TELEVISION") geo = new THREE.BoxGeometry(2.0, 1.1, 0.1);
    else if (type === "REFRIGERATOR") geo = new THREE.BoxGeometry(1.0, 2.0, 1.0);
    else if (type === "WASHING_MACHINE") geo = new THREE.BoxGeometry(1.0, 1.1, 1.0);
    else geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);

    const mat = new THREE.MeshStandardMaterial({
        color: 0x2e324a,
        metalness: 0.6,
        roughness: 0.3
    });
    const body = new THREE.Mesh(geo, mat);
    body.castShadow = true;
    group.add(body);

    // Glowing Neon Status Ring / Indicator Sphere
    const statusGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const statusMat = new THREE.MeshStandardMaterial({
        color: 0x00e676,
        emissive: 0x00e676,
        emissiveIntensity: 0.8
    });
    const statusLight = new THREE.Mesh(statusGeo, statusMat);
    statusLight.position.set(0, (geo.parameters.height / 2) + 0.3, 0);
    group.add(statusLight);

    // Data Binding
    group.userData = {
        name,
        type,
        isOn: true,
        wattage: defaultWatt,
        statusMesh: statusLight,
        bodyMesh: body
    };

    scene.add(group);
    interactiveObjects.push(group);
}

// ─── ENVIRONMENT LIGHTING & WEATHER ──────────────────────────────────────────

let dirLight, ambientLight;

function buildEnvironmentLighting() {
    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0x00e5ff, 1.2);
    dirLight.position.set(20, 30, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
}

function buildRainParticles() {
    const count = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 40;
        positions[i + 1] = Math.random() * 25;
        positions[i + 2] = (Math.random() - 0.5) * 40;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0x00e5ff,
        size: 0.12,
        transparent: true,
        opacity: 0.6
    });

    rainParticles = new THREE.Points(geometry, material);
    rainParticles.visible = false;
    scene.add(rainParticles);
}

window.setWeatherMode = function(mode) {
    currentWeather = mode;
    if (!scene || !ambientLight || !dirLight) return;

    if (mode === "SUNNY") {
        scene.background = new THREE.Color(0x0c0d14);
        scene.fog.color = new THREE.Color(0x0c0d14);
        ambientLight.intensity = 0.8;
        ambientLight.color.setHex(0xffffff);
        dirLight.intensity = 1.4;
        dirLight.color.setHex(0xffffff);
        if (rainParticles) rainParticles.visible = false;
    } else if (mode === "NIGHT") {
        scene.background = new THREE.Color(0x040408);
        scene.fog.color = new THREE.Color(0x040408);
        ambientLight.intensity = 0.2;
        ambientLight.color.setHex(0x334466);
        dirLight.intensity = 0.4;
        dirLight.color.setHex(0x5577aa);
        if (rainParticles) rainParticles.visible = false;
        // Make room lights brighter at night
        roomLights.forEach(l => l.intensity = 1.6);
    } else if (mode === "RAIN") {
        scene.background = new THREE.Color(0x080c14);
        scene.fog.color = new THREE.Color(0x080c14);
        ambientLight.intensity = 0.4;
        ambientLight.color.setHex(0x6688aa);
        dirLight.intensity = 0.6;
        if (rainParticles) rainParticles.visible = true;
    }
};

// ─── 3D CHARACTER AVATAR ──────────────────────────────────────────────────────

function buildCharacterAvatar() {
    if (characterMesh) scene.remove(characterMesh);

    const group = new THREE.Group();

    // Body Colors based on selected character
    let bodyColor = 0x00e5ff;
    let headColor = 0xffffff;
    if (selectedCharacter === "MAN") { bodyColor = 0x2979ff; headColor = 0xffcc80; }
    else if (selectedCharacter === "WOMAN") { bodyColor = 0xff4081; headColor = 0xffe0b2; }
    else if (selectedCharacter === "CHILD") { bodyColor = 0xffeb3b; headColor = 0xffd54f; }

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: headColor });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    group.add(head);

    // Torso
    const torsoGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.9, 16);
    const torsoMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.85;
    group.add(torso);

    // Character Eye / Visor (Glowing)
    const visorGeo = new THREE.BoxGeometry(0.35, 0.12, 0.2);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.5, 0.28);
    group.add(visor);

    group.position.set(0, 0, 3);
    scene.add(group);
    characterMesh = group;
}

window.setCharacterType = function(type) {
    selectedCharacter = type;
    buildCharacterAvatar();
};

// ─── FPS / ORBIT CAMERA TOGGLE ───────────────────────────────────────────────

window.toggleFpsMode = function() {
    isFpsMode = !isFpsMode;
    const btn = document.getElementById("btn-toggle-fps");
    const hud = document.getElementById("fps-hud-instructions");

    if (isFpsMode) {
        orbitControls.enabled = false;
        if (characterMesh) characterMesh.visible = false; // Hide avatar in 1st person
        camera.position.set(characterMesh ? characterMesh.position.x : 0, 1.6, characterMesh ? characterMesh.position.z : 3);
        if (btn) btn.innerHTML = `<i class="fa-solid fa-eye text-neon-green"></i> FPS Modu Aktif (Karakter Gözü)`;
        if (hud) hud.classList.remove("hidden");
    } else {
        orbitControls.enabled = true;
        if (characterMesh) characterMesh.visible = true;
        camera.position.set(16, 18, 20);
        orbitControls.target.set(0, 0, 0);
        if (btn) btn.innerHTML = `<i class="fa-solid fa-gamepad text-neon-blue"></i> FPS Moduna Geç`;
        if (hud) hud.classList.add("hidden");
    }
};

// ─── CONTROLS & RAYCASTER INTERACTION ────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function setup3DEventListeners(container) {
    // Keyboard for FPS movement
    window.addEventListener("keydown", (e) => {
        if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) {
            keys[e.key] = true;
            keys[e.code] = true;
        }
    });

    window.addEventListener("keyup", (e) => {
        if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) {
            keys[e.key] = false;
            keys[e.code] = false;
        }
    });

    // Raycast on Click to Toggle 3D Appliance
    container.addEventListener("click", (event) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const meshesToTest = interactiveObjects.map(obj => obj.userData.bodyMesh);
        const intersects = raycaster.intersectObjects(meshesToTest);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const parentGroup = clickedMesh.parent;
            if (parentGroup && parentGroup.userData) {
                const d = parentGroup.userData;
                d.isOn = !d.isOn;
                d.statusMesh.material.color.setHex(d.isOn ? 0x00e676 : 0x606072);
                d.statusMesh.material.emissive.setHex(d.isOn ? 0x00e676 : 0x000000);

                if (window.showToast) {
                    window.showToast("3D Akıllı Ev", `${d.name} 3D sahneden ${d.isOn ? 'AÇILDI (ON)' : 'KAPATILDI (OFF)'}!`, d.isOn ? "success" : "warning");
                }
            }
        }
    });
}

// ─── MAIN RENDER ANIMATION LOOP ──────────────────────────────────────────────

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    // 1. Rain Animation
    if (rainParticles && rainParticles.visible) {
        const positions = rainParticles.geometry.attributes.position.array;
        for (let i = 1; i < positions.length; i += 3) {
            positions[i] -= 0.6;
            if (positions[i] < 0) positions[i] = 25;
        }
        rainParticles.geometry.attributes.position.needsUpdate = true;
    }

    // 2. FPS Movement
    if (isFpsMode && camera) {
        if (keys.w || keys.KeyW || keys.ArrowUp) {
            camera.translateZ(-moveSpeed);
        }
        if (keys.s || keys.KeyS || keys.ArrowDown) {
            camera.translateZ(moveSpeed);
        }
        if (keys.a || keys.KeyA || keys.ArrowLeft) {
            camera.translateX(-moveSpeed);
        }
        if (keys.d || keys.KeyD || keys.ArrowRight) {
            camera.translateX(moveSpeed);
        }
        camera.position.y = 1.6; // Maintain eye height
        // Bound inside house
        camera.position.x = Math.max(-11, Math.min(11, camera.position.x));
        camera.position.z = Math.max(-9, Math.min(9, camera.position.z));
    } else if (orbitControls) {
        orbitControls.update();
    }

    // 3. Render
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}
