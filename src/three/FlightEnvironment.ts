import {
  BackSide,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three'

const standard = (color: number, roughness = 0.82): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness, metalness: 0.04 })

function createSky(): Mesh {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      void main() {
        float horizon = smoothstep(-0.18, 0.55, normalize(vPosition).y);
        vec3 low = vec3(0.58, 0.72, 0.78);
        vec3 high = vec3(0.055, 0.16, 0.25);
        vec3 color = mix(low, high, horizon);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
  const sky = new Mesh(new SphereGeometry(1100, 32, 16), material)
  sky.name = 'Atmospheric sky dome'
  return sky
}

function createTerrain(): Mesh {
  const geometry = new PlaneGeometry(900, 900, 64, 64)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.attributes.position
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const distance = Math.hypot(x, z)
    const rise = Math.max(0, Math.min((distance - 210) / 220, 1))
    const variation = 12 + Math.sin(x * 0.025) * 7 + Math.cos(z * 0.021) * 6
    positions.setY(index, Math.max(0, rise * variation))
  }
  geometry.computeVertexNormals()
  const terrain = new Mesh(geometry, standard(0x40583f, 1))
  terrain.name = 'Procedural terrain'
  terrain.receiveShadow = true
  return terrain
}

function createRunway(): Group {
  const group = new Group()
  group.name = 'Runway and taxiways'
  const runway = new Mesh(new BoxGeometry(24, 0.18, 230), standard(0x283238, 0.94))
  runway.position.y = 0.08
  runway.receiveShadow = true
  group.add(runway)

  const edgeMaterial = new MeshBasicMaterial({ color: 0xe7e1c8 })
  for (const x of [-10.8, 10.8]) {
    const edge = new Mesh(new BoxGeometry(0.42, 0.04, 216), edgeMaterial.clone())
    edge.position.set(x, 0.2, 0)
    group.add(edge)
  }
  for (let z = -98; z <= 98; z += 16) {
    const dash = new Mesh(new BoxGeometry(0.7, 0.04, 8), edgeMaterial.clone())
    dash.position.set(0, 0.21, z)
    group.add(dash)
  }
  for (const z of [-103, 103]) {
    for (let x = -7.5; x <= 7.5; x += 3) {
      const threshold = new Mesh(new BoxGeometry(1.45, 0.04, 9), edgeMaterial.clone())
      threshold.position.set(x, 0.21, z)
      group.add(threshold)
    }
  }

  const taxiway = new Mesh(new BoxGeometry(10, 0.12, 160), standard(0x465057, 0.95))
  taxiway.position.set(38, 0.07, 5)
  group.add(taxiway)
  const connector = new Mesh(new BoxGeometry(38, 0.12, 10), standard(0x465057, 0.95))
  connector.position.set(19, 0.07, 12)
  group.add(connector)
  const apron = new Mesh(new BoxGeometry(62, 0.12, 54), standard(0x586268, 0.95))
  apron.position.set(70, 0.07, 20)
  group.add(apron)
  return group
}

function createHelipad(): Group {
  const group = new Group()
  group.name = 'Helipad landmark'
  group.position.set(70, 0.2, 16)
  const pad = new Mesh(new CylinderGeometry(11, 11, 0.18, 40), standard(0x313a3e))
  const ring = new Mesh(
    new RingGeometry(8.4, 9.2, 40),
    new MeshBasicMaterial({ color: 0xf1d86a, side: 2 }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.11
  const left = new Mesh(new BoxGeometry(1.1, 0.08, 8), new MeshBasicMaterial({ color: 0xf5f1df }))
  left.position.set(-2.5, 0.12, 0)
  const right = left.clone()
  right.geometry = left.geometry.clone()
  right.material = (left.material as MeshBasicMaterial).clone()
  right.position.x = 2.5
  const cross = new Mesh(
    new BoxGeometry(5.8, 0.08, 1.1),
    new MeshBasicMaterial({ color: 0xf5f1df }),
  )
  cross.position.y = 0.12
  group.add(pad, ring, left, right, cross)
  return group
}

function createBuildings(): Group {
  const group = new Group()
  group.name = 'Airport buildings and control tower'
  const wall = standard(0xb7b4a5)
  const roof = standard(0x6e3e34)
  const glass = standard(0x397a8e, 0.25)

  const hangar = new Mesh(new BoxGeometry(34, 12, 24), wall)
  hangar.position.set(105, 6, 12)
  hangar.castShadow = true
  const hangarRoof = new Mesh(new BoxGeometry(36, 1.1, 26), roof)
  hangarRoof.position.set(105, 12.4, 12)
  hangarRoof.castShadow = true
  const door = new Mesh(new BoxGeometry(22, 8, 0.35), standard(0x33454c))
  door.position.set(105, 4.5, -0.15)
  group.add(hangar, hangarRoof, door)

  const terminal = new Mesh(new BoxGeometry(42, 7, 18), standard(0xd0c8b6))
  terminal.position.set(105, 3.5, 48)
  const windows = new Mesh(new BoxGeometry(34, 3.1, 0.3), glass)
  windows.position.set(105, 4.2, 38.85)
  group.add(terminal, windows)

  const tower = new Mesh(new CylinderGeometry(2.3, 3.5, 20, 10), standard(0x9d9b91))
  tower.position.set(63, 10, -57)
  const cab = new Mesh(new CylinderGeometry(5.2, 4.3, 4.5, 10), glass)
  cab.position.set(63, 21.5, -57)
  const cap = new Mesh(new ConeGeometry(5.7, 2, 10), roof)
  cap.position.set(63, 24.7, -57)
  group.add(tower, cab, cap)

  const beaconColors = [0xe94f43, 0xeeeeea]
  for (let level = 0; level < 8; level += 1) {
    const mast = new Mesh(new CylinderGeometry(0.5, 0.65, 3, 8), standard(beaconColors[level % 2]!))
    mast.position.set(-82, 1.5 + level * 3, -82)
    group.add(mast)
  }
  return group
}

function createLandscapeDetails(): Group {
  const group = new Group()
  group.name = 'Roads, pond and trees'
  const road = new Mesh(new TorusGeometry(155, 3.6, 8, 96), standard(0x343c3e, 0.96))
  road.rotation.x = Math.PI / 2
  road.position.y = 0.12
  group.add(road)

  const pond = new Mesh(new CylinderGeometry(30, 34, 0.16, 40), standard(0x2d7890, 0.2))
  pond.position.set(-148, 0.1, 78)
  group.add(pond)

  const count = 64
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.45, 0.62, 4, 7),
    standard(0x684936),
    count,
  )
  const crowns = new InstancedMesh(new ConeGeometry(2.5, 7, 8), standard(0x28523a), count)
  const matrix = new Matrix4()
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + Math.sin(index * 1.7) * 0.08
    const radius = 178 + (index % 5) * 9
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const scale = 0.78 + (index % 7) * 0.055
    matrix.makeScale(scale, scale, scale).setPosition(x, 2 * scale, z)
    trunks.setMatrixAt(index, matrix)
    matrix.makeScale(scale, scale, scale).setPosition(x, 6.5 * scale, z)
    crowns.setMatrixAt(index, matrix)
  }
  trunks.castShadow = true
  crowns.castShadow = true
  group.add(trunks, crowns)
  return group
}

export function createFlightEnvironment(): Group {
  const environment = new Group()
  environment.name = 'Procedural airport environment'
  environment.add(
    createSky(),
    createTerrain(),
    createRunway(),
    createHelipad(),
    createBuildings(),
    createLandscapeDetails(),
  )
  return environment
}
