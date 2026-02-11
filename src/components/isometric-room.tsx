'use client';

import React, { useMemo, useRef, useEffect, useState, useCallback, Suspense } from 'react';
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

interface ExitingMember {
  member: RoomMember;
  slotIndex: number;
  startTime: number;
  modelPath: string;
}

/* ───────────────────── Exit Animation ──────────────────── */

const DOOR_POSITION: [number, number, number] = [4.0, 0, 0];
const TOTAL_EXIT_DURATION = 8750; // ms

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  [-1.2, -0.8],
  [1.2, -0.8],
  [-1.2, 0.8],
  [1.2, 0.8],
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

/* ── Exit Door (right edge wall) ── */
function ExitDoor() {
  return (
    <group position={[DOOR_POSITION[0], 0, DOOR_POSITION[2]]}>
      {/* Door frame - left pillar */}
      <mesh position={[0.02, 0.85, -0.55]}>
        <boxGeometry args={[0.14, 1.7, 0.1]} />
        <meshStandardMaterial color="#6a4a32" />
      </mesh>
      {/* Door frame - right pillar */}
      <mesh position={[0.02, 0.85, 0.55]}>
        <boxGeometry args={[0.14, 1.7, 0.1]} />
        <meshStandardMaterial color="#6a4a32" />
      </mesh>
      {/* Door frame - top */}
      <mesh position={[0.02, 1.7, 0]}>
        <boxGeometry args={[0.14, 0.08, 1.2]} />
        <meshStandardMaterial color="#6a4a32" />
      </mesh>
      {/* Door panel (half-open, swings inward) */}
      <group position={[0.02, 0.82, -0.5]} rotation={[0, Math.PI / 3, 0]}>
        <mesh position={[0.25, 0, 0]}>
          <boxGeometry args={[0.5, 1.64, 0.04]} />
          <meshStandardMaterial color="#7a5a3a" />
        </mesh>
        {/* Door handle */}
        <mesh position={[0.44, -0.1, 0.04]}>
          <boxGeometry args={[0.06, 0.04, 0.06]} />
          <meshStandardMaterial color="#c8a84e" />
        </mesh>
      </group>
    </group>
  );
}

/* ── Exiting Character (animated) ── */
function ExitingCharacter({
  exitingMember,
  onComplete,
}: {
  exitingMember: ExitingMember;
  onComplete: () => void;
}) {
  const { scene } = useGLTF(exitingMember.modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const legLeftRef = useRef<THREE.Object3D | null>(null);
  const legRightRef = useRef<THREE.Object3D | null>(null);
  const completedRef = useRef(false);

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

  // Cache leg references
  useEffect(() => {
    cloned.traverse((child) => {
      if (child.name === 'leg-left') legLeftRef.current = child;
      if (child.name === 'leg-right') legRightRef.current = child;
      // Start seated
      if (child.name === 'leg-left' || child.name === 'leg-right') {
        child.rotation.x = -Math.PI / 2;
      }
    });
  }, [cloned]);

  // Station position in world space
  const stationPos = useMemo(() => {
    const grid = GRID[exitingMember.slotIndex];
    if (!grid) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(grid[0], 0, grid[1]);
  }, [exitingMember.slotIndex]);

  // Character offset within station
  const charOffset = new THREE.Vector3(0, -0.15, -0.45);
  const startPos = stationPos.clone().add(charOffset);
  const doorTarget = new THREE.Vector3(DOOR_POSITION[0], 0, DOOR_POSITION[2]);

  // Build waypoints to avoid collisions with other desks/characters
  // Route: startPos → (waypoints) → doorTarget → off-screen
  const waypoints = useMemo(() => {
    const pts: THREE.Vector3[] = [startPos.clone()];
    const slotGrid = GRID[exitingMember.slotIndex];
    if (slotGrid) {
      const sx = slotGrid[0];
      const sz = slotGrid[1];
      // Back row (Z > 0): step out behind desk first, then walk along the aisle
      if (sz > 0) {
        // Step back behind the desk (Z + offset to clear desk depth)
        pts.push(new THREE.Vector3(sx, 0, sz + 1.0));
        // Walk to the right side aisle
        pts.push(new THREE.Vector3(DOOR_POSITION[0], 0, sz + 1.0));
      }
      // Front-right slot: can go straight to door
      // Front-left slot: step out then go right
      else if (sx < 0) {
        // Step away from desk
        pts.push(new THREE.Vector3(sx, 0, sz - 0.8));
        // Walk along the front aisle to the right
        pts.push(new THREE.Vector3(DOOR_POSITION[0], 0, sz - 0.8));
      }
    }
    pts.push(doorTarget.clone());
    // Off-screen: always walk through the door (X+ direction, past the right edge)
    pts.push(new THREE.Vector3(doorTarget.x + 4, 0, doorTarget.z));
    return pts;
  }, [exitingMember.slotIndex, startPos, doorTarget]);

  // Compute total path length for constant-speed walking
  const { segLengths, totalLength } = useMemo(() => {
    const lengths: number[] = [];
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const d = waypoints[i].distanceTo(waypoints[i - 1]);
      lengths.push(d);
      total += d;
    }
    return { segLengths: lengths, totalLength: total };
  }, [waypoints]);

  useFrame(() => {
    if (!groupRef.current || completedRef.current) return;

    const elapsed = Date.now() - exitingMember.startTime;
    const group = groupRef.current;

    if (elapsed >= TOTAL_EXIT_DURATION) {
      completedRef.current = true;
      onComplete();
      return;
    }

    const STAND_END = 1500;

    if (elapsed < STAND_END) {
      // Phase 1: Stand up
      const t = easeInOutCubic(elapsed / STAND_END);
      const legAngle = -Math.PI / 2 * (1 - t);
      if (legLeftRef.current) legLeftRef.current.rotation.x = legAngle;
      if (legRightRef.current) legRightRef.current.rotation.x = legAngle;
      group.position.set(startPos.x, t * 0.15, startPos.z);
    } else {
      // Phase 2: Walk along waypoints at constant speed
      const walkT = (elapsed - STAND_END) / (TOTAL_EXIT_DURATION - STAND_END);
      const targetDist = walkT * totalLength;

      // Find which segment we're on
      let accumulated = 0;
      let posX = startPos.x;
      let posZ = startPos.z;
      let dirX = 0;
      let dirZ = 0;
      for (let i = 0; i < segLengths.length; i++) {
        if (accumulated + segLengths[i] >= targetDist) {
          const segT = (targetDist - accumulated) / segLengths[i];
          const from = waypoints[i];
          const to = waypoints[i + 1];
          posX = from.x + (to.x - from.x) * segT;
          posZ = from.z + (to.z - from.z) * segT;
          dirX = to.x - from.x;
          dirZ = to.z - from.z;
          break;
        }
        accumulated += segLengths[i];
        // Past all segments — clamp to end
        if (i === segLengths.length - 1) {
          const last = waypoints[waypoints.length - 1];
          posX = last.x;
          posZ = last.z;
          const prev = waypoints[waypoints.length - 2];
          dirX = last.x - prev.x;
          dirZ = last.z - prev.z;
        }
      }

      group.position.set(posX, 0.15, posZ);
      // Face movement direction
      if (dirX !== 0 || dirZ !== 0) {
        group.rotation.y = Math.atan2(dirX, dirZ);
      }
      // Walking leg cycle
      const walkCycle = Math.sin((elapsed - STAND_END) * 0.012) * 0.5;
      if (legLeftRef.current) legLeftRef.current.rotation.x = walkCycle;
      if (legRightRef.current) legRightRef.current.rotation.x = -walkCycle;
    }
  });

  return (
    <group ref={groupRef} position={[startPos.x, 0, startPos.z]}>
      <group scale={0.5}>
        <primitive object={cloned} />
      </group>
    </group>
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
  // Stable user_id → slot mapping (persists across re-renders)
  const slotMapRef = useRef<Map<string, number>>(new Map());
  const prevSlotMapRef = useRef<Map<string, number>>(new Map());
  const prevMembersMapRef = useRef<Map<string, RoomMember>>(new Map());
  const [exitingMembers, setExitingMembers] = useState<Map<string, ExitingMember>>(new Map());
  const prevUserIdsRef = useRef<Set<string>>(new Set());

  // Build stable slot assignments: each user keeps their first-assigned slot
  const stableSlots = useMemo(() => {
    const slotMap = slotMapRef.current;
    const numSlots = Math.min(maxSlots, 4);

    // Snapshot current slotMap before mutation (for exit detection)
    prevSlotMapRef.current = new Map(slotMap);

    // Collect active member user_ids
    const activeMembers = members.filter((m): m is RoomMember => m !== null);
    const activeIds = new Set(activeMembers.map((m) => m.user_id));

    // Remove users no longer present from slotMap
    for (const [uid] of slotMap) {
      if (!activeIds.has(uid)) {
        slotMap.delete(uid);
      }
    }

    // Assign slots to new members using first available slot
    for (const m of activeMembers) {
      if (!slotMap.has(m.user_id)) {
        const usedSlots = new Set(slotMap.values());
        for (let s = 0; s < numSlots; s++) {
          if (!usedSlots.has(s)) {
            slotMap.set(m.user_id, s);
            break;
          }
        }
      }
    }

    // Build slots array
    const slots: { idx: number; member: RoomMember | null; position: [number, number] }[] = [];
    for (let i = 0; i < numSlots; i++) {
      slots.push({
        idx: i,
        member: null,
        position: (GRID[i] ?? [0, 0]) as [number, number],
      });
    }
    for (const m of activeMembers) {
      const slot = slotMap.get(m.user_id);
      if (slot !== undefined && slot < numSlots) {
        slots[slot].member = m;
      }
    }

    return slots;
  }, [members, maxSlots]);

  // Detect exits by comparing user_id sets
  useEffect(() => {
    const activeMembers = members.filter((m): m is RoomMember => m !== null);
    const currentIds = new Set(activeMembers.map((m) => m.user_id));
    const prevIds = prevUserIdsRef.current;

    const newExiting = new Map(exitingMembers);
    let changed = false;

    // Users who left
    for (const uid of prevIds) {
      if (!currentIds.has(uid) && !newExiting.has(uid)) {
        // Use the snapshot taken before cleanup
        const slotIndex = prevSlotMapRef.current.get(uid);
        const prevMember = prevMembersMapRef.current.get(uid);
        if (slotIndex !== undefined) {
          newExiting.set(uid, {
            member: prevMember ?? { user_id: uid, display_name: '', status: 'away', studying_minutes: 0 },
            slotIndex,
            startTime: Date.now(),
            modelPath: CHARACTER_MODELS[slotIndex % CHARACTER_MODELS.length],
          });
          changed = true;
        }
      }
    }

    // Users who re-joined — cancel exit animation
    for (const uid of currentIds) {
      if (newExiting.has(uid)) {
        newExiting.delete(uid);
        changed = true;
      }
    }

    if (changed) {
      setExitingMembers(newExiting);
    }

    prevUserIdsRef.current = currentIds;
    // Store current members for next diff
    const membersMap = new Map<string, RoomMember>();
    for (const m of activeMembers) {
      membersMap.set(m.user_id, m);
    }
    prevMembersMapRef.current = membersMap;
  }, [members]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExitComplete = useCallback((userId: string) => {
    setExitingMembers((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

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

        {/* Floor */}
        <group position={[0, -0.01, 0]}>
          {/* Fill */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 6]} />
            <meshBasicMaterial color="#d4956a" transparent opacity={0.06} />
          </mesh>
          {/* Border edges (4 lines) */}
          {[
            { pos: [0, 0.001, -3] as const, args: [8, 0.03] as const },
            { pos: [0, 0.001, 3] as const, args: [8, 0.03] as const },
            { pos: [-4, 0.001, 0] as const, args: [0.03, 6] as const },
            { pos: [4, 0.001, 0] as const, args: [0.03, 6] as const },
          ].map(({ pos, args }, i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], pos[1], pos[2]]}>
              <planeGeometry args={[args[0], args[1]]} />
              <meshBasicMaterial color="#e8854a" transparent opacity={0.5} />
            </mesh>
          ))}
          {/* Corner glow dots */}
          {[[-4, -3], [4, -3], [-4, 3], [4, 3]].map(([x, z], i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.002, z]}>
              <circleGeometry args={[0.08, 16]} />
              <meshBasicMaterial color="#e8854a" transparent opacity={0.8} />
            </mesh>
          ))}
        </group>

        {/* Scene */}
        <Suspense fallback={null}>
          {stableSlots.map(({ idx, member, position }) => (
            <Station
              key={idx}
              member={member}
              index={idx}
              currentUserId={currentUserId}
              position={position}
            />
          ))}
          <ExitDoor />
          {Array.from(exitingMembers.entries()).map(([userId, em]) => (
            <ExitingCharacter
              key={userId}
              exitingMember={em}
              onComplete={() => handleExitComplete(userId)}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}
