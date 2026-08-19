import { BufferGeometry, Material, Object3D, Texture, WebGLRenderer } from 'three'

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose()
  }
  material.dispose()
}

export function disposeObject3D(object: Object3D): void {
  object.traverse((child) => {
    const renderable = child as Object3D & {
      geometry?: BufferGeometry
      material?: Material | Material[]
    }
    renderable.geometry?.dispose()
    if (!renderable.material) return
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material]
    materials.forEach(disposeMaterial)
  })
}

export function disposeRenderer(renderer: WebGLRenderer): void {
  renderer.renderLists.dispose()
  renderer.dispose()
  renderer.forceContextLoss()
  renderer.domElement.remove()
}
