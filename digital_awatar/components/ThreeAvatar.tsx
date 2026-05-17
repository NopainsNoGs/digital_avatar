'use client';

import { MutableRefObject, useEffect, useRef, useState } from 'react';
import type { VisemeFrame } from '@/types/terminal';
import type { VRM } from '@pixiv/three-vrm';

type ThreeAvatarProps = {
  emotion?: string;
  audioUrl?: string | null;
  visemeTrack?: VisemeFrame[];
  visemeTrackRef?: MutableRefObject<VisemeFrame[]>;
  speechTimeRef?: MutableRefObject<number>;
  speakingRef?: MutableRefObject<boolean>;
  mouthOpenRef?: MutableRefObject<number>;
};

const EMOTION_PRESETS: Record<string, string> = {
  neutral: 'neutral',
  smile: 'happy',
  happy: 'happy',
  shy: 'relaxed',
  relaxed: 'relaxed',
  sad: 'sad',
  angry: 'angry',
  surprised: 'surprised',
};

const EMOTION_KEYS = [
  'neutral',
  'happy',
  'relaxed',
  'sad',
  'angry',
  'surprised',
] as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function sampleViseme(track: VisemeFrame[], time: number, cursorRef: MutableRefObject<number>) {
  if (!track.length) {
    return 0;
  }

  let cursor = Math.min(cursorRef.current, track.length - 1);
  while (cursor + 1 < track.length && track[cursor + 1].t <= time) {
    cursor += 1;
  }
  while (cursor > 0 && track[cursor].t > time) {
    cursor -= 1;
  }
  cursorRef.current = cursor;

  const current = track[cursor];
  const next = track[cursor + 1];
  if (!current) {
    return 0;
  }
  if (!next || time <= current.t) {
    return clamp01(current.y);
  }

  const span = Math.max(next.t - current.t, 1e-3);
  const alpha = clamp01((time - current.t) / span);
  return clamp01(current.y + (next.y - current.y) * alpha);
}

function disposeMaterial(material: unknown) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    Object.values(item).forEach((value) => {
      if (
        value &&
        typeof value === 'object' &&
        'isTexture' in value &&
        value.isTexture === true &&
        'dispose' in value &&
        typeof value.dispose === 'function'
      ) {
        value.dispose();
      }
    });

    if ('dispose' in item && typeof item.dispose === 'function') {
      item.dispose();
    }
  });
}

export default function ThreeAvatar({
  emotion = 'neutral',
  audioUrl,
  visemeTrack = [],
  visemeTrackRef,
  speechTimeRef,
  speakingRef,
  mouthOpenRef,
}: ThreeAvatarProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const emotionRef = useRef(emotion);
  const visemeRef = useRef(visemeTrack);
  const visemeCursorRef = useRef(0);
  const lastVisemeTimeRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    visemeRef.current = visemeTrack;
    visemeCursorRef.current = 0;
  }, [visemeTrack]);

  useEffect(() => {
    const prev = audioRef.current;
    if (prev) {
      prev.pause();
      prev.removeAttribute('src');
      prev.load();
    }

    if (!audioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    audio.setAttribute('playsinline', 'true');
    audio.crossOrigin = 'anonymous';
    void audio.play().catch(() => {});
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let currentVrm: VRM | null = null;
    let renderer: import('three').WebGLRenderer | null = null;
    let disposeVrm: (() => void) | null = null;

    const init = async () => {
      try {
        const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }, THREE] = await Promise.all([
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('@pixiv/three-vrm'),
          import('three'),
        ]);

        if (cancelled) {
          return;
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
        camera.position.set(0, 1.5, 0.7);
        camera.lookAt(0, 1.45, 0); // 新增：强制让镜头对焦在 Y=1.45 的脸部位置

        const webglRenderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        });
        webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
        webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        host.appendChild(webglRenderer.domElement);
        renderer = webglRenderer;

        scene.add(new THREE.AmbientLight(0xffffff, 1.35));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
        keyLight.position.set(1, 2, 3);
        scene.add(keyLight);

        const clock = new THREE.Clock();
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const resize = () => {
          const width = host.clientWidth || 1;
          const height = host.clientHeight || 1;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          webglRenderer.setSize(width, height, false);
        };

        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        loader.load(
          '/avatar/model.vrm',
          (gltf) => {
            if (cancelled) {
              gltf.scene.traverse((node) => {
                const mesh = node as { isMesh?: boolean; geometry?: { dispose?: () => void }; material?: unknown };
                if (mesh.isMesh) {
                  mesh.geometry?.dispose?.();
                  disposeMaterial(mesh.material);
                }
              });
              return;
            }

            const vrm = gltf.userData.vrm as VRM | undefined;
            if (!vrm) {
              if (!cancelled) {
                setLoadError('VRM model loaded, but no VRM data was found.');
              }
              return;
            }

            VRMUtils.rotateVRM0(vrm);
            vrm.scene.position.set(0, -0.035, 0);
            vrm.scene.rotation.y = Math.PI;
            // 消除 T-Pose：强行把左右大臂放下来，呈现自然的 A-Pose 或垂手站姿
            if (vrm.humanoid) {
              const leftArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
              const rightArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
              if (leftArm) leftArm.rotation.z = 1.2;  // 左臂自然下垂
              if (rightArm) rightArm.rotation.z = -1.2; // 右臂自然下垂
            }
            vrm.scene.traverse((obj) => {
              obj.frustumCulled = false;
            });

            currentVrm = vrm;
            disposeVrm = () => {
              scene.remove(vrm.scene);
              vrm.scene.traverse((node) => {
                const mesh = node as { isMesh?: boolean; geometry?: { dispose?: () => void }; material?: unknown };
                if (mesh.isMesh) {
                  mesh.geometry?.dispose?.();
                  disposeMaterial(mesh.material);
                }
              });
              VRMUtils.deepDispose(vrm.scene);
            };
            if (!cancelled) {
              setLoadError(null);
            }
            scene.add(vrm.scene);
          },
          undefined,
          (error) => {
            if (!cancelled) {
              setLoadError('Missing /public/avatar/model.vrm or failed to parse it.');
            }
            console.error('VRM load failed:', error);
          },
        );

        const render = () => {
          if (cancelled) {
            return;
          }

          frameId = requestAnimationFrame(render);

          const vrm = currentVrm;
          if (vrm?.expressionManager) {
            const manager = vrm.expressionManager;
            const preset = EMOTION_PRESETS[emotionRef.current] ?? 'neutral';
            const audio = audioRef.current;
            const liveTrack = visemeTrackRef?.current?.length ? visemeTrackRef.current : visemeRef.current;
            const liveTime = speechTimeRef?.current ?? 0;
            const isLiveSpeaking = speakingRef?.current ?? false;
            const sampleTime = audio && !audio.paused && !audio.ended ? audio.currentTime : liveTime;

            if (sampleTime < lastVisemeTimeRef.current - 0.05) {
              visemeCursorRef.current = 0;
            }
            lastVisemeTimeRef.current = sampleTime;

            const aa =
              audio && !audio.paused && !audio.ended
                ? sampleViseme(visemeRef.current, audio.currentTime, visemeCursorRef)
                : isLiveSpeaking && liveTrack.length > 0
                  ? sampleViseme(liveTrack, liveTime, visemeCursorRef)
                  : clamp01(mouthOpenRef?.current ?? 0);

            for (const key of EMOTION_KEYS) {
              manager.setValue(key, key === preset ? 1 : 0);
            }
            manager.setValue('aa', aa);
          }
          if (vrm?.humanoid) {
            const spine = vrm.humanoid.getNormalizedBoneNode('spine');
            if (spine) {
              const t = clock.getElapsedTime();
              // 1.5 是呼吸频率，0.015 是呼吸幅度，你可以自己微调
              spine.rotation.x = Math.sin(t * 1.5) * 0.015; 
            }
          } 
          const delta = clock.getDelta();
          vrm?.update(delta);
          webglRenderer.render(scene, camera);
        };

        render();
      } catch (error) {
        if (!cancelled) {
          setLoadError('Failed to initialize Three.js / VRM runtime.');
        }
        console.error('ThreeAvatar init failed:', error);
      }
    };

    void init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      resizeObserver = null;

      if (currentVrm) {
        disposeVrm?.();
      }

      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
  }, [mouthOpenRef, speakingRef, speechTimeRef, visemeTrackRef]);

  return (
    // 1. 把 items-start 改成 items-center，让它在垂直方向上居中
    <div className="relative flex h-[420px] w-full max-w-[820px] items-center justify-center overflow-hidden pointer-events-auto md:h-[520px] xl:h-[600px] [mask-image:linear-gradient(to_bottom,black_75%,transparent_100%)]">
      
      {/* 2. 删掉负边距(-mt-6)，加上 translate-x 和 translate-y 来向右下方平移 */}
      <div 
        ref={hostRef} 
        className="h-full w-full outline-none drop-shadow-2xl translate-x-[40px] translate-y-[35px]" 
      />
      
      {/* ... */}
    </div>
  );
}
