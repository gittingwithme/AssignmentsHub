'use client'

import React, { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PresentationControls, Float } from '@react-three/drei'
import * as THREE from 'three'

/* Brand-aligned face palette (emerald → teal, matches globals.css tokens) */
const FACE = {
  U: '#f4f4f5',
  D: '#101614',
  F: '#10B981',
  B: '#0E765E',
  R: '#14B8A6',
  L: '#2DD4BF',
} as const

const BODY = '#0C1210'
const CUBIE_SIZE = 0.94
const MOVE_DURATION = 0.42
const MOVE_PAUSE = 0.18

type Axis = 'x' | 'y' | 'z'
type GridPos = [number, number, number]

type Move = {
  axis: Axis
  layer: -1 | 0 | 1
  direction: 1 | -1
}

type CubieState = {
  id: string
  position: GridPos
  quaternion: THREE.Quaternion
}

type ActiveMove = {
  move: Move
  progress: number
  snapshots: Map<
    string,
    { position: THREE.Vector3; quaternion: THREE.Quaternion }
  >
}

const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

const MOVE_SEQUENCE: Move[] = [
  { axis: 'y', layer: 1, direction: 1 },
  { axis: 'x', layer: 1, direction: -1 },
  { axis: 'z', layer: 1, direction: 1 },
  { axis: 'y', layer: 0, direction: -1 },
  { axis: 'x', layer: -1, direction: 1 },
  { axis: 'z', layer: -1, direction: -1 },
  { axis: 'y', layer: -1, direction: 1 },
  { axis: 'x', layer: 0, direction: -1 },
  { axis: 'z', layer: 0, direction: 1 },
  { axis: 'y', layer: 1, direction: -1 },
  { axis: 'x', layer: 1, direction: 1 },
  { axis: 'z', layer: 1, direction: -1 },
]

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function inLayer(pos: GridPos, axis: Axis, layer: number) {
  if (axis === 'x') return pos[0] === layer
  if (axis === 'y') return pos[1] === layer
  return pos[2] === layer
}

function createInitialCubies(): CubieState[] {
  const cubies: CubieState[] = []
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        cubies.push({
          id: `${x},${y},${z}`,
          position: [x, y, z],
          quaternion: new THREE.Quaternion(),
        })
      }
    }
  }
  return cubies
}

function applyMove(cubies: CubieState[], move: Move) {
  const axisVec = AXIS_VEC[move.axis]
  const angle = (Math.PI / 2) * move.direction
  const delta = new THREE.Quaternion().setFromAxisAngle(axisVec, angle)

  for (const cubie of cubies) {
    if (!inLayer(cubie.position, move.axis, move.layer)) continue

    const pos = new THREE.Vector3(...cubie.position).applyQuaternion(delta)
    cubie.position = [
      Math.round(pos.x),
      Math.round(pos.y),
      Math.round(pos.z),
    ] as GridPos
    cubie.quaternion.premultiply(delta).normalize()
  }
}

function useSharedMaterials() {
  return useMemo(() => {
    const make = (color: string) =>
      new THREE.MeshLambertMaterial({ color })

    return {
      body: make(BODY),
      U: make(FACE.U),
      D: make(FACE.D),
      F: make(FACE.F),
      B: make(FACE.B),
      R: make(FACE.R),
      L: make(FACE.L),
    }
  }, [])
}

type SharedMaterials = ReturnType<typeof useSharedMaterials>

function faceMaterialsForCubie(
  x: number,
  y: number,
  z: number,
  mats: SharedMaterials,
): THREE.MeshLambertMaterial[] {
  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
  return [
    x === 1 ? mats.R : mats.body,
    x === -1 ? mats.L : mats.body,
    y === 1 ? mats.U : mats.body,
    y === -1 ? mats.D : mats.body,
    z === 1 ? mats.F : mats.body,
    z === -1 ? mats.B : mats.body,
  ]
}

function Cubie({
  meshRef,
  materials,
}: {
  meshRef: React.Ref<THREE.Mesh>
  materials: THREE.MeshLambertMaterial[]
}) {
  return (
    <mesh ref={meshRef} material={materials}>
      <boxGeometry args={[CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE]} />
    </mesh>
  )
}

function RubiksCubeScene({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null!)
  const meshRefs = useRef<Record<string, THREE.Mesh>>({})
  const [cubies] = useState(() => createInitialCubies())
  const activeMoveRef = useRef<ActiveMove | null>(null)
  const moveIndexRef = useRef(0)
  const pauseRef = useRef(0)
  const elapsedRef = useRef(0)
  const sharedMaterials = useSharedMaterials()

  const cubieMaterials = useMemo(() => {
    const map = new Map<string, THREE.MeshLambertMaterial[]>()
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          map.set(
            `${x},${y},${z}`,
            faceMaterialsForCubie(x, y, z, sharedMaterials),
          )
        }
      }
    }
    return map
  }, [sharedMaterials])

  const startMove = (move: Move) => {
    const snapshots = new Map<
      string,
      { position: THREE.Vector3; quaternion: THREE.Quaternion }
    >()

    for (const cubie of cubies) {
      if (!inLayer(cubie.position, move.axis, move.layer)) continue
      snapshots.set(cubie.id, {
        position: new THREE.Vector3(...cubie.position),
        quaternion: cubie.quaternion.clone(),
      })
    }

    activeMoveRef.current = { move, progress: 0, snapshots }
  }

  useEffect(() => {
    for (const cubie of cubies) {
      const mesh = meshRefs.current[cubie.id]
      if (!mesh) continue
      mesh.position.set(...cubie.position)
      mesh.quaternion.copy(cubie.quaternion)
    }
  }, [cubies])

  useFrame((_, delta) => {
    elapsedRef.current += delta
    const time = elapsedRef.current

    if (groupRef.current && !activeMoveRef.current) {
      groupRef.current.rotation.y = reducedMotion ? 0.28 : time * 0.05
      groupRef.current.rotation.x = reducedMotion
        ? 0.12
        : Math.sin(time * 0.12) * 0.04
    }

    if (pauseRef.current > 0) {
      pauseRef.current -= delta
      return
    }

    const active = activeMoveRef.current

    if (!active) {
      if (reducedMotion) return
      startMove(MOVE_SEQUENCE[moveIndexRef.current % MOVE_SEQUENCE.length]!)
      moveIndexRef.current += 1
      return
    }

    active.progress += delta / MOVE_DURATION

    const { move, snapshots } = active
    const axisVec = AXIS_VEC[move.axis]
    const eased = easeInOutCubic(Math.min(active.progress, 1))
    const angle = (Math.PI / 2) * move.direction * eased
    const deltaQuat = new THREE.Quaternion().setFromAxisAngle(axisVec, angle)

    for (const cubie of cubies) {
      const mesh = meshRefs.current[cubie.id]
      const snapshot = snapshots.get(cubie.id)
      if (!mesh || !snapshot) continue

      mesh.position.copy(snapshot.position).applyQuaternion(deltaQuat)
      mesh.quaternion.copy(snapshot.quaternion).premultiply(deltaQuat)
    }

    if (active.progress >= 1) {
      applyMove(cubies, move)

      for (const cubie of cubies) {
        const mesh = meshRefs.current[cubie.id]
        if (!mesh) continue
        mesh.position.set(...cubie.position)
        mesh.quaternion.copy(cubie.quaternion)
      }

      activeMoveRef.current = null
      pauseRef.current = MOVE_PAUSE
    }
  })

  return (
    <group ref={groupRef}>
      {cubies.map((cubie) => {
        const materials = cubieMaterials.get(cubie.id)!

        return (
          <Cubie
            key={cubie.id}
            materials={materials}
            meshRef={(ref: THREE.Mesh | null) => {
              if (ref) {
                meshRefs.current[cubie.id] = ref
                ref.position.set(...cubie.position)
              }
            }}
          />
        )
      })}
    </group>
  )
}

function SceneCanvas({ reducedMotion }: { reducedMotion: boolean }) {
  const [dpr, setDpr] = useState(1.5)

  useEffect(() => {
    const update = () =>
      setDpr(window.innerWidth < 768 ? 1 : Math.min(window.devicePixelRatio, 2))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <Canvas
      camera={{ position: [0, 0.15, 6.2], fov: 42 }}
      dpr={dpr}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.debug.checkShaderErrors = false
      }}
    >
      <ambientLight intensity={0.72} />
      <hemisphereLight args={['#f4f4f5', '#141418', 0.45]} />
      <directionalLight position={[8, 10, 6]} intensity={1.1} />
      <directionalLight position={[-6, -4, -8]} intensity={0.28} />
      <pointLight position={[0, 0, 4]} intensity={0.2} color="#10B981" />

      <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.9}>
        <PresentationControls
          global={false}
          cursor
          snap
          rotation={[0.22, 0.38, 0]}
          polar={[-Math.PI / 5, Math.PI / 5]}
          azimuth={[-Math.PI / 4, Math.PI / 4]}
        >
          <RubiksCubeScene reducedMotion={reducedMotion} />
        </PresentationControls>
      </Float>
    </Canvas>
  )
}

export default function HeroCube() {
  const [reducedMotion, setReducedMotion] = useState(false)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarse = window.matchMedia('(pointer: coarse)')

    const sync = () => {
      setReducedMotion(motion.matches)
      setIsCoarsePointer(coarse.matches)
    }

    sync()
    motion.addEventListener('change', sync)
    coarse.addEventListener('change', sync)
    return () => {
      motion.removeEventListener('change', sync)
      coarse.removeEventListener('change', sync)
    }
  }, [])

  return (
    <div
      className="relative mx-auto w-full max-w-[420px] sm:max-w-none"
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-x-6 bottom-2 h-10 rounded-full bg-teal-500/10 blur-2xl" />
      <div className="relative h-[220px] w-full sm:h-[280px] md:h-[320px] lg:h-[360px]">
        <SceneCanvas reducedMotion={reducedMotion} />
      </div>
      {isCoarsePointer ? (
        <p className="mt-2 text-center text-[11px] tracking-wide text-zinc-400">
          Drag to inspect the cube
        </p>
      ) : null}
    </div>
  )
}
