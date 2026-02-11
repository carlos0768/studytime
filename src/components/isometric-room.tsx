'use client';

import React, { useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrthographicCamera, Html } from '@react-three/drei';
import * as THREE from 'three';

/* ───────────────────────── Types ───────────────────────── */

interface RoomMember {
  user_id: string;
  display_name: string;
  status: string;
  studying_minutes: number;
}

interface IsometricRoomProps {
  members: (RoomMember | null)[];
  currentUserId: string;
  maxSlots: number;
}

/* ───────────────────── Character Models ──────────────────── */

const CHARACTER_MODELS = [
  '/models/character-a.glb',
  '/models/character-b.glb',
  '/models/character-c.glb',
  '/models/character-d.glb',
];

// Preload all models
CHARACTER_MODELS.forEach((path) => useGLTF.preload(path));

/* ──────────────── Station Grid (3D positions) ─────────────── */

const GRID: [number, number][] = [
  [-1.8, -1.2],
  [1.8, -1.2],
  [-1.8, 1.2],
  [1.8, 1.2],
];

/* ═══════════════════════════════════════════════════════════
   3D Components
   ═══════════════════════════════════════════════════════════ */

function CharacterModel({
  modelPath,
  isStudying,
}: {
  modelPath: string;
  isStudying: boolean;
}) {
  const { scene } = useGLTF(modelPath);
  const ref = useRef<THREE.Group>(null);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }
    });
    return c;
  }, [scene]);

  // Apply sitting pose
  useEffect(() => {
    cloned.traverse((child) => {
      if (child.name === 'leg-left' || child.name === 'leg-right') {
        child.rotation.x = -Math.PI / 2;
      }
      if (child.name === 'arm-left' || child.name === 'arm-right') {
        if (isStudying) {
          child.rotation.x = -Math.PI / 6; // Arms forward to desk
        } else {
          child.rotation.x = -Math.PI / 2.5; // Arms raised holding phone
        }
      }
    });
  }, [cloned, isStudying]);

  // Gentle idle animation
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    if (isStudying) {
      ref.current.position.y = Math.sin(t * 1.5) * 0.02;
    } else {
      ref.current.position.y = Math.sin(t * 0.8) * 0.03;
      ref.current.rotation.y = Math.sin(t * 0.5) * 0.1;
    }
  });

  return (
    <group ref={ref} scale={0.5}>
      <primitive object={cloned} />
      {/* Smartphone in hands when not studying */}
      {!isStudying && (
        <group position={[0, 1.6, 0.7]}>
          <mesh rotation={[-Math.PI / 2.5, 0, 0]}>
            <boxGeometry args={[0.4, 0.06, 0.7]} />
            <meshStandardMaterial color="#222222" />
          </mesh>
          <mesh rotation={[-Math.PI / 2.5, 0, 0]} position={[0, 0.035, 0]}>
            <boxGeometry args={[0.32, 0.01, 0.58]} />
            <meshStandardMaterial color="#1a2a3a" emissive="#4a9eff" emissiveIntensity={0.6} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ── Desk ── */
function Desk({ hasMember, isStudying }: { hasMember: boolean; isStudying: boolean }) {
  return (
    <group position={[0, 0.25, 0.5]}>
      {/* Desk top */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 0.06, 0.7]} />
        <meshStandardMaterial color="#54463a" />
      </mesh>
      {/* Legs */}
      {[[-0.5, -0.13, -0.25], [0.5, -0.13, -0.25], [-0.5, -0.13, 0.25], [0.5, -0.13, 0.25]].map(
        ([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[0.06, 0.26, 0.06]} />
            <meshStandardMaterial color="#1c1c1c" />
          </mesh>
        )
      )}
      {/* Open textbook (studying) */}
      {hasMember && isStudying && (
        <group position={[0, 0.04, -0.05]}>
          <mesh position={[-0.14, 0, 0]} rotation={[0, 0, 0.05]}>
            <boxGeometry args={[0.26, 0.015, 0.34]} />
            <meshStandardMaterial color="#f0e8d8" />
          </mesh>
          <mesh position={[0.14, 0, 0]} rotation={[0, 0, -0.05]}>
            <boxGeometry args={[0.26, 0.015, 0.34]} />
            <meshStandardMaterial color="#ede5d3" />
          </mesh>
          <mesh position={[0, -0.005, 0]}>
            <boxGeometry args={[0.03, 0.025, 0.36]} />
            <meshStandardMaterial color="#8b4513" />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ── Chair ── */
function Chair() {
  return (
    <group position={[0, 0.2, -0.5]}>
      {/* Seat */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 0.06, 0.5]} />
        <meshStandardMaterial color="#1c1c1c" />
      </mesh>
      {/* Back */}
      <mesh position={[0, 0.25, -0.22]}>
        <boxGeometry args={[0.6, 0.44, 0.06]} />
        <meshStandardMaterial color="#161616" />
      </mesh>
      {/* Legs */}
      {[[-0.25, -0.13, -0.18], [0.25, -0.13, -0.18], [-0.25, -0.13, 0.18], [0.25, -0.13, 0.18]].map(
        ([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[0.05, 0.26, 0.05]} />
            <meshStandardMaterial color="#181818" />
          </mesh>
        )
      )}
    </group>
  );
}

/* ── Name Label (HTML overlay) ── */
function NameLabel({
  name,
  isCurrentUser,
}: {
  name: string;
  isCurrentUser: boolean;
}) {
  return (
    <Html position={[0, 1.4, 0]} center sprite>
      <div
        style={{
          color: isCurrentUser ? 'rgb(180,210,190)' : 'rgba(255,255,255,0.55)',
          fontSize: '11px',
          fontWeight: isCurrentUser ? 600 : 400,
          fontFamily: "'Noto Sans JP', sans-serif",
          whiteSpace: 'nowrap',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {name.length > 8 ? name.slice(0, 7) + '…' : name}
      </div>
    </Html>
  );
}

/* ── Station (desk + chair + character) ── */
function Station({
  member,
  index,
  currentUserId,
  position,
}: {
  member: RoomMember | null;
  index: number;
  currentUserId: string;
  position: [number, number];
}) {
  const modelPath = CHARACTER_MODELS[index % CHARACTER_MODELS.length];
  const isStudying = member?.status === 'studying';

  return (
    <group position={[position[0], 0, position[1]]}>
      <Chair />
      {member && (
        <>
          <group position={[0, -0.15, -0.45]}>
            <CharacterModel modelPath={modelPath} isStudying={isStudying ?? false} />
          </group>
          <NameLabel
            name={member.display_name}
            isCurrentUser={member.user_id === currentUserId}
          />
        </>
      )}
      <Desk hasMember={!!member} isStudying={isStudying === true} />
    </group>
  );
}

/* ── Camera Setup ── */
function CameraSetup() {
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();

  // Responsive zoom: scale down on narrow screens
  const zoom = useMemo(() => {
    const minDim = Math.min(size.width, size.height);
    if (minDim < 400) return 50;
    if (minDim < 600) return 60;
    return 80;
  }, [size.width, size.height]);

  useFrame(() => {
    if (cameraRef.current) {
      cameraRef.current.lookAt(0, 0.5, 0);
      cameraRef.current.zoom = zoom;
      cameraRef.current.updateProjectionMatrix();
    }
  });

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      zoom={zoom}
      position={[10, 10, 10]}
      near={0.1}
      far={100}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Exported Component
   ═══════════════════════════════════════════════════════════ */

export function IsometricRoom({ members, currentUserId, maxSlots }: IsometricRoomProps) {
  const stations = useMemo(() => {
    return Array.from({ length: Math.min(maxSlots, 4) }, (_, i) => ({
      idx: i,
      member: members[i] ?? null,
      position: GRID[i] ?? [0, 0],
    }));
  }, [members, maxSlots]);

  return (
    <div className="w-full h-full select-none">
      <Canvas
        shadows
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <CameraSetup />

        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 8, 3]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />

        {/* Scene */}
        <Suspense fallback={null}>
          {stations.map(({ idx, member, position }) => (
            <Station
              key={idx}
              member={member}
              index={idx}
              currentUserId={currentUserId}
              position={position as [number, number]}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}
