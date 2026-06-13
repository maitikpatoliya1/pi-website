/* Pansuriya Impex — interactive 3D round brilliant for the hero.
   Adapted from the standalone diamond-3d viewer: renders into the hero
   container with a transparent background, drag to rotate, slow idle spin. */

import * as THREE from 'three';

const container = document.querySelector('.hero-visual');
const canvas = document.getElementById('diamondCanvas');
const poster = document.querySelector('.hero-stone');
if (!container || !canvas) throw new Error('hero 3D mount points missing');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 80);
const camDir = new THREE.Vector3(0, 1.5, 7.4).normalize();
const dist = 4.65;

/* Clean studio cube map: soft light blobs, no hard card edges to refract as lines. */
function gemEnv() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x2b2b31);

  const makeSoftTexture = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.78)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.24)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  const softTexture = makeSoftTexture();
  const softPanel = (w, h, color, intensity, x, y, z, spin = 0, opacity = 1) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        map: softTexture,
        opacity,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    if (spin) m.rotateZ(spin);
    env.add(m);
  };
  const panels = [
    [9.0, 6.4, 0xfffbf0, 3.9,  0,  6,  4,  0.04, 0.95],
    [5.6, 7.0, 0xfff6df, 3.0, -6,  2,  3, -0.12, 0.9],
    [5.0, 6.2, 0xf8fbff, 2.65,  6,  1, -2,  0.14, 0.86],
    [6.6, 4.0, 0xfff8e8, 2.45,  1, -4,  6, -0.08, 0.78],
    [5.8, 4.8, 0x25262c, 0.9, -4, -2, -5,  0.05, 0.7],
    [5.6, 5.2, 0x22232a, 0.88,  4,  1, -6, -0.08, 0.68],
    [9.0, 7.0, 0x1f2026, 0.88, 0, -7, 1, 0, 0.75],
  ];
  panels.forEach(p => softPanel(...p));
  softPanel(1.4, 1.4, 0xffffff, 5.0,  2.2, 4.7,  3.2,  0.18, 0.9);
  softPanel(1.3, 1.3, 0xffdf95, 3.2, -4.0, 4.0,  4.0,  0.12, 0.85);
  softPanel(1.2, 1.2, 0xd7efff, 2.4,  4.0, 3.0, -4.0, -0.16, 0.78);
  softPanel(1.0, 1.0, 0xffc7d6, 1.9, -5.0, 1.0, -2.0,  0.08, 0.72);
  softPanel(1.6, 1.2, 0x15161b, 0.88, -2.3, 0.5,  5.4,  0.22, 0.72);
  softPanel(1.5, 1.2, 0x24262d, 0.82,  3.0, 0.2,  4.8, -0.18, 0.68);
  return env;
}

const diamondCubeTarget = new THREE.WebGLCubeRenderTarget(512, {
  type: THREE.HalfFloatType,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
const diamondCubeCamera = new THREE.CubeCamera(0.1, 100, diamondCubeTarget);
diamondCubeCamera.update(renderer, gemEnv());

const SR = 0.82, GY = 0;
const tableRatio = 0.57;
const crownAngle = THREE.MathUtils.degToRad(34.5);
const pavilionAngle = THREE.MathUtils.degToRad(40.75);
const girdleRatio = 0.025;
const starLength = 0.50;
const lowerHalfLength = 0.75;
const tR = SR * tableRatio;
const gh = SR * girdleRatio;
const cH = (SR - tR) * Math.tan(crownAngle);
const pD = SR * Math.tan(pavilionAngle) * 1.12;
const crownTop = gh + cH;
const culetY = -gh - pD;
const MAX_FACET_PLANES = 96;

const diamondUniforms = {
  envMap: { value: diamondCubeTarget.texture },
  objectRotation: { value: new THREE.Matrix3() },
  lightA: { value: new THREE.Vector3() },
  lightB: { value: new THREE.Vector3() },
  lightC: { value: new THREE.Vector3() },
  hColorTint: { value: new THREE.Vector3(1.0, 0.968, 0.89) },
  sparkleTime: { value: 0 },
  tableMode: { value: 0 },
  cutDimensions: {
    value: new THREE.Vector4(SR, gh, crownTop, tR),
  },
  pavilionBottom: { value: culetY },
  facetPlanes: {
    value: Array.from(
      { length: MAX_FACET_PLANES },
      () => new THREE.Vector4()
    ),
  },
  facetPlaneCount: { value: 0 },
};

const vertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vLocalPosition = position;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform samplerCube envMap;
  uniform mat3 objectRotation;
  uniform vec3 lightA;
  uniform vec3 lightB;
  uniform vec3 lightC;
  uniform vec3 hColorTint;
  uniform float sparkleTime;
  uniform float tableMode;
  uniform vec4 cutDimensions;
  uniform float pavilionBottom;
  uniform vec4 facetPlanes[${MAX_FACET_PLANES}];
  uniform int facetPlaneCount;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  float boundaryHit(vec3 origin, vec3 direction, out vec3 hitNormal) {
    float best = 1000.0;
    hitNormal = vec3(0.0, 1.0, 0.0);

    for (int i = 0; i < ${MAX_FACET_PLANES}; i++) {
      if (i < facetPlaneCount) {
        vec3 normal = facetPlanes[i].xyz;
        float denominator = dot(normal, direction);
        if (denominator > 0.00001) {
          float t = (
            facetPlanes[i].w - dot(normal, origin)
          ) / denominator;
          if (t > 0.0001 && t < best) {
            best = t;
            hitNormal = normal;
          }
        }
      }
    }
    return best;
  }

  vec3 internalExit(vec3 localIncident, vec3 localNormal, float ior) {
    vec3 direction = refract(localIncident, localNormal, 1.0 / ior);
    if (dot(direction, direction) < 0.001) {
      direction = reflect(localIncident, localNormal);
    }

    vec3 origin = vLocalPosition + direction * 0.0015;
    for (int bounce = 0; bounce < 3; bounce++) {
      vec3 boundaryNormal;
      float distanceToBoundary = boundaryHit(origin, direction, boundaryNormal);
      vec3 hitPoint = origin + direction * distanceToBoundary;
      vec3 exitDirection = refract(direction, -boundaryNormal, ior);
      if (dot(exitDirection, exitDirection) > 0.001) {
        return normalize(objectRotation * exitDirection);
      }
      direction = reflect(direction, boundaryNormal);
      origin = hitPoint + direction * 0.0015;
    }
    return normalize(objectRotation * direction);
  }

  vec3 directGlint(vec3 normal, vec3 viewDirection, vec3 lightPosition) {
    vec3 lightDirection = normalize(lightPosition - vWorldPosition);
    float alignment = max(dot(reflect(-lightDirection, normal), viewDirection), 0.0);
    float broad = pow(alignment, 36.0);
    float sharp = pow(alignment, 260.0);
    return vec3(broad * 0.34 + sharp * 3.7);
  }

  vec3 spectralGlint(vec3 normal, vec3 viewDirection) {
    float seed = dot(normal, vec3(31.7, 47.2, 61.9))
      + dot(vLocalPosition, vec3(17.0, 29.0, 43.0));
    float pulseA = pow(max(0.0, sin(seed + sparkleTime * 2.7)), 18.0);
    float pulseB = pow(max(0.0, sin(seed * 1.37 - sparkleTime * 3.4)), 22.0);
    float edge = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 1.4);
    vec3 warmFire = vec3(1.0, 0.72, 0.34) * pulseA;
    vec3 coolFire = vec3(0.42, 0.68, 1.0) * pulseB;
    return (warmFire + coolFire) * edge * 0.32;
  }

  vec3 diamondStudioLight(vec3 direction) {
    vec3 d = normalize(direction);
    float overhead = pow(max(dot(d, normalize(vec3(-0.18, 0.92, 0.34))), 0.0), 3.1);
    float leftSoftbox = pow(max(dot(d, normalize(vec3(-0.72, 0.36, 0.58))), 0.0), 3.8);
    float rightSoftbox = pow(max(dot(d, normalize(vec3(0.68, 0.24, -0.62))), 0.0), 4.1);
    float lowerGlow = pow(max(dot(d, normalize(vec3(0.18, -0.36, 0.92))), 0.0), 5.2);
    float horizon = pow(max(0.0, 1.0 - abs(d.y)), 1.55);
    float warmFire = pow(max(dot(d, normalize(vec3(-0.45, 0.5, -0.74))), 0.0), 46.0);
    float coolFire = pow(max(dot(d, normalize(vec3(0.56, 0.44, 0.7))), 0.0), 52.0);
    float lowDark = smoothstep(0.08, 0.88, -d.y);
    vec3 color = vec3(0.052, 0.053, 0.058);
    color += vec3(0.9, 0.88, 0.78) * overhead * 0.86;
    color += vec3(0.82, 0.79, 0.7) * leftSoftbox * 0.56;
    color += vec3(0.72, 0.8, 0.92) * rightSoftbox * 0.48;
    color += vec3(0.28, 0.3, 0.34) * horizon * 0.22;
    color += vec3(0.58, 0.54, 0.48) * lowerGlow * 0.24;
    color += vec3(1.0, 0.66, 0.24) * warmFire * 0.62;
    color += vec3(0.36, 0.66, 1.0) * coolFire * 0.52;
    color *= 1.0 - lowDark * 0.34;
    return max(color * hColorTint, vec3(0.032, 0.032, 0.03));
  }

  vec3 diamondFacetEnv(vec3 direction) {
    return diamondStudioLight(direction);
  }

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 localViewDirection = normalize(transpose(objectRotation) * viewDirection);
    vec3 localNormal = normalize(cross(dFdx(vLocalPosition), dFdy(vLocalPosition)));
    if (tableMode > 0.5) localNormal = vec3(0.0, 1.0, 0.0);
    if (dot(localNormal, localViewDirection) < 0.0) localNormal = -localNormal;
    vec3 normal = normalize(objectRotation * localNormal);
    vec3 incident = -viewDirection;
    vec3 localIncident = -localViewDirection;

    vec3 reflectedDirection = reflect(incident, normal);
    vec3 reflected = diamondFacetEnv(reflectedDirection);

    vec3 refractedRed = diamondFacetEnv(internalExit(localIncident, localNormal, 2.409));
    vec3 refractedGreen = diamondFacetEnv(internalExit(localIncident, localNormal, 2.417));
    vec3 refractedBlue = diamondFacetEnv(internalExit(localIncident, localNormal, 2.426));
    vec3 internalColor = vec3(refractedRed.r, refractedGreen.g, refractedBlue.b);
    internalColor = mix(internalColor, internalColor * hColorTint, 0.2);
    reflected = mix(reflected, reflected * hColorTint, 0.08);
    internalColor = pow(max(internalColor, vec3(0.0)), vec3(1.04));
    reflected = pow(max(reflected, vec3(0.0)), vec3(0.96));
    internalColor = max(internalColor, vec3(0.036, 0.035, 0.032));
    reflected = max(reflected, vec3(0.024, 0.024, 0.026));

    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float f0 = 0.172;
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - facing, 5.0);
    vec3 glints = directGlint(normal, viewDirection, lightA)
                + directGlint(normal, viewDirection, lightB)
                + directGlint(normal, viewDirection, lightC) * 0.72
                + spectralGlint(normal, viewDirection);

    if (tableMode > 0.5) {
      vec3 directRay = refract(localIncident, localNormal, 1.0 / 2.42);
      if (dot(directRay, directRay) < 0.001) {
        directRay = reflect(localIncident, localNormal);
      }
      vec3 directTransmission = diamondFacetEnv(
        normalize(objectRotation * directRay)
      );
      vec3 tableInterior = mix(directTransmission, internalColor, 0.66);
      tableInterior = pow(max(tableInterior, vec3(0.0)), vec3(1.06)) * 0.98;
      tableInterior = mix(tableInterior, tableInterior * hColorTint, 0.12);
      float tableFresnel = max(0.19, fresnel);
      vec3 tableColor = mix(
        tableInterior,
        reflected * 1.18,
        min(1.0, tableFresnel * 1.1)
      );
      tableColor += glints * 0.22;
      gl_FragColor = vec4(tableColor, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    vec3 color = mix(internalColor * 1.02, reflected * 1.2, min(1.0, fresnel * 1.08));
    color += glints * 0.92;
    color *= 0.9 + 0.23 * facing;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const diamondOpticalMaterial = new THREE.ShaderMaterial({
  uniforms: diamondUniforms,
  side: THREE.DoubleSide,
  transparent: false,
  extensions: { derivatives: true },
  vertexShader,
  fragmentShader,
});

const diamondTableMaterial = new THREE.ShaderMaterial({
  uniforms: {
    envMap: diamondUniforms.envMap,
    objectRotation: diamondUniforms.objectRotation,
    lightA: diamondUniforms.lightA,
    lightB: diamondUniforms.lightB,
    lightC: diamondUniforms.lightC,
    hColorTint: diamondUniforms.hColorTint,
    sparkleTime: diamondUniforms.sparkleTime,
    tableMode: { value: 1 },
    cutDimensions: diamondUniforms.cutDimensions,
    pavilionBottom: diamondUniforms.pavilionBottom,
    facetPlanes: diamondUniforms.facetPlanes,
    facetPlaneCount: diamondUniforms.facetPlaneCount,
  },
  side: THREE.DoubleSide,
  transparent: false,
  extensions: { derivatives: true },
  vertexShader,
  fragmentShader,
});

const pivot = new THREE.Group();
scene.add(pivot);

/* ── Standard 57-facet round brilliant ── */
function makeRoundBrilliant() {
  const positions = [];
  const indices = [];
  const addVertex = (radius, y, angle) => {
    positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    return positions.length / 3 - 1;
  };
  const tri = (a, b, c) => indices.push(a, b, c);
  const step = Math.PI / 4;
  const halfStep = step / 2;
  const starR = tR + (SR - tR) * starLength;
  const starY = crownTop - Math.tan(crownAngle)
    * (starR * Math.cos(halfStep) - tR);
  const lowerR = SR * (1 - lowerHalfLength);
  const lowerY = culetY + ((-gh - culetY) / SR)
    * lowerR * Math.cos(halfStep);

  const table = [];
  const star = [];
  const girdleMainTop = [];
  const girdleMidTop = [];
  const girdleMainBottom = [];
  const girdleMidBottom = [];
  const lower = [];

  for (let i = 0; i < 8; i++) {
    const mainAngle = i * step;
    const midAngle = mainAngle + halfStep;
    table.push(addVertex(tR, crownTop, mainAngle));
    star.push(addVertex(starR, starY, midAngle));
    girdleMainTop.push(addVertex(SR, gh, mainAngle));
    girdleMidTop.push(addVertex(SR, gh, midAngle));
    girdleMainBottom.push(addVertex(SR, -gh, mainAngle));
    girdleMidBottom.push(addVertex(SR, -gh, midAngle));
    lower.push(addVertex(lowerR, lowerY, midAngle));
  }
  const culet = addVertex(0, culetY, 0);

  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    const previous = (i + 7) % 8;

    // 8 star facets.
    tri(table[i], table[next], star[i]);

    // 8 bezel facets. Each kite is split into two coplanar triangles.
    tri(table[i], star[i], girdleMainTop[i]);
    tri(table[i], girdleMainTop[i], star[previous]);

    // 16 upper-half facets.
    tri(star[i], girdleMidTop[i], girdleMainTop[i]);
    tri(star[i], girdleMainTop[next], girdleMidTop[i]);

    // 16 lower-half facets.
    tri(lower[i], girdleMainBottom[i], girdleMidBottom[i]);
    tri(lower[i], girdleMidBottom[i], girdleMainBottom[next]);

    // 8 pavilion mains. Each kite is split into two coplanar triangles.
    tri(girdleMainBottom[i], lower[i], culet);
    tri(girdleMainBottom[i], culet, lower[previous]);
  }

  const girdleTop = [];
  const girdleBottom = [];
  for (let i = 0; i < 8; i++) {
    girdleTop.push(girdleMainTop[i], girdleMidTop[i]);
    girdleBottom.push(girdleMainBottom[i], girdleMidBottom[i]);
  }
  for (let i = 0; i < 16; i++) {
    const next = (i + 1) % 16;
    tri(girdleTop[i], girdleBottom[i], girdleBottom[next]);
    tri(girdleTop[i], girdleBottom[next], girdleTop[next]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const stone = new THREE.Mesh(geometry, diamondOpticalMaterial);

  const tablePositions = [0, crownTop, 0];
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI * 2 / 8;
    tablePositions.push(
      Math.cos(angle) * tR,
      crownTop,
      Math.sin(angle) * tR
    );
  }
  const tableIndices = [];
  for (let i = 0; i < 8; i++) {
    tableIndices.push(0, ((i + 1) % 8) + 1, i + 1);
  }
  const tableGeometry = new THREE.BufferGeometry();
  tableGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(tablePositions, 3)
  );
  tableGeometry.setIndex(tableIndices);
  tableGeometry.computeVertexNormals();

  const opticalPlanes = [];
  const interiorPoint = new THREE.Vector3(0, -0.08, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeAB = new THREE.Vector3();
  const edgeAC = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const fromFace = new THREE.Vector3();

  const addOpticalPlanes = sourceGeometry => {
    const attribute = sourceGeometry.getAttribute('position');
    const sourceIndices = sourceGeometry.index.array;
    for (let i = 0; i < sourceIndices.length; i += 3) {
      a.fromBufferAttribute(attribute, sourceIndices[i]);
      b.fromBufferAttribute(attribute, sourceIndices[i + 1]);
      c.fromBufferAttribute(attribute, sourceIndices[i + 2]);
      edgeAB.subVectors(b, a);
      edgeAC.subVectors(c, a);
      normal.crossVectors(edgeAB, edgeAC).normalize();
      fromFace.subVectors(interiorPoint, a);
      if (normal.dot(fromFace) > 0) normal.negate();
      const constant = normal.dot(a);
      const duplicate = opticalPlanes.some(plane =>
        plane.x * normal.x + plane.y * normal.y + plane.z * normal.z > 0.99999
        && Math.abs(plane.w - constant) < 0.0001
      );
      if (!duplicate) {
        opticalPlanes.push(
          new THREE.Vector4(normal.x, normal.y, normal.z, constant)
        );
      }
    }
  };

  addOpticalPlanes(geometry);
  addOpticalPlanes(tableGeometry);
  if (opticalPlanes.length > MAX_FACET_PLANES) {
    throw new Error(`Diamond uses ${opticalPlanes.length} optical planes`);
  }
  diamondUniforms.facetPlaneCount.value = opticalPlanes.length;
  opticalPlanes.forEach((plane, index) => {
    diamondUniforms.facetPlanes.value[index].copy(plane);
  });

  const tableMesh = new THREE.Mesh(tableGeometry, diamondTableMaterial);

  const stoneGroup = new THREE.Group();
  stoneGroup.add(stone, tableMesh);
  stoneGroup.position.y = GY;
  return stoneGroup;
}

const diamondGroup = makeRoundBrilliant();
pivot.add(diamondGroup);

const glintA = new THREE.Vector3();
const glintB = new THREE.Vector3();
const glintC = new THREE.Vector3();

/* ── Sizing: checked every frame so it stays correct without ResizeObserver ── */
let lastW = 0, lastH = 0;
function checkSize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h || (w === lastW && h === lastH)) return;
  lastW = w; lastH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
checkSize();

/* ── Interaction: drag to rotate with inertia (page scroll untouched) ── */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let dragging = false, lx = 0, ly = 0, vx = 0, vy = 0;
let rotX = 0.28, rotY = -0.12;
let lastInteract = 0;

canvas.addEventListener('pointerdown', e => {
  dragging = true;
  lx = e.clientX; ly = e.clientY;
  canvas.classList.add('grabbing');
  canvas.setPointerCapture(e.pointerId);
  lastInteract = performance.now();
});
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  vy += (e.clientX - lx) * 0.0075;
  vx += (e.clientY - ly) * 0.0075;
  lx = e.clientX; ly = e.clientY;
  lastInteract = performance.now();
});
const endDrag = () => {
  dragging = false;
  canvas.classList.remove('grabbing');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ── Render loop (paused while the hero is off-screen) ── */
const clock = new THREE.Clock();
let firstFrame = true;
let visible = true;

function frame() {
  checkSize();
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  vx *= 0.90; vy *= 0.90;
  rotX = Math.max(0.12, Math.min(1.02, rotX + vx));
  rotY += vy;

  const idle = (performance.now() - lastInteract) / 1000;
  if (!dragging && !reducedMotion && idle > 2.5) {
    rotY += Math.min(1, (idle - 2.5) / 3) * 0.22 * dt;
  }

  pivot.rotation.x = rotX;
  pivot.rotation.y = rotY;

  const shineSpin = THREE.MathUtils.radToDeg(rotY) * 0.08;
  const shineEnergy = Math.min(0.12, Math.hypot(vx, vy));
  container.style.setProperty('--shine-rotate', `${shineSpin.toFixed(3)}deg`);
  container.style.setProperty('--shine-counter', `${(-shineSpin * 0.72).toFixed(3)}deg`);
  container.style.setProperty('--shine-x', `${(Math.sin(rotY) * 8).toFixed(2)}px`);
  container.style.setProperty('--shine-y', `${(Math.sin(rotY * 0.7 + rotX) * 4).toFixed(2)}px`);
  container.style.setProperty('--shine-intensity', `${(0.82 + 0.08 * Math.sin(t * 0.8) + shineEnergy).toFixed(3)}`);
  container.style.setProperty('--sparkle-intensity', `${(0.76 + 0.18 * Math.sin(t * 1.35) + shineEnergy * 0.9).toFixed(3)}`);

  camera.position.copy(camDir).multiplyScalar(dist);
  camera.lookAt(0, 0, 0);

  glintA.set(Math.cos(t * 0.5) * 4, 3.5 + Math.sin(t * 0.33), Math.sin(t * 0.5) * 4);
  glintB.set(Math.cos(-t * 0.37 + 2) * 3.5, 2.5, Math.sin(-t * 0.37 + 2) * 3.5);
  glintC.set(Math.sin(t * 0.43 + 0.9) * 4.4, 4.2, Math.cos(t * 0.43 + 0.9) * 4.4);

  diamondGroup.updateWorldMatrix(true, false);
  diamondUniforms.objectRotation.value.setFromMatrix4(diamondGroup.matrixWorld);
  diamondUniforms.lightA.value.copy(glintA);
  diamondUniforms.lightB.value.copy(glintB);
  diamondUniforms.lightC.value.copy(glintC);
  diamondUniforms.sparkleTime.value = t;

  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    if (poster) poster.classList.add('gone');
    container.classList.add('live');
  }
}

new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  renderer.setAnimationLoop(visible ? frame : null);
}, { threshold: 0.02 }).observe(container);

frame(); // paint immediately, before the first rAF tick
window.__piDiamondFrame = frame;
renderer.setAnimationLoop(frame);
