import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';

export interface PostFx {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  resize: (w: number, h: number, dpr: number) => void;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFx {
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 選択的 bloom: イベント時の emissive ピークだけを光らせる。threshold を上げて
  // baseline の中輝度が常時光るのを止め、minute/hour/flip の瞬間だけ世界が反応する。
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55, // strength (was 0.85)
    0.5, // radius
    0.55, // threshold (was 0.18 — 大幅 up で常時 bloom を抑制)
  );
  composer.addPass(bloom);

  // Vignette: 周辺減光を強めて視線を中央の砂時計に集中させる
  const vignettePass = new ShaderPass(VignetteShader);
  vignettePass.uniforms.offset.value = 0.85;
  vignettePass.uniforms.darkness.value = 1.85;
  composer.addPass(vignettePass);

  // FXAA: 微細エッジのジャギー除去
  const fxaaPass = new ShaderPass(FXAAShader);
  composer.addPass(fxaaPass);

  // sRGB / トーンマッピング出力
  composer.addPass(new OutputPass());

  const resize = (w: number, h: number, dpr: number) => {
    composer.setSize(w, h);
    composer.setPixelRatio(dpr);
    bloom.setSize(w, h);
    fxaaPass.material.uniforms['resolution'].value.set(1 / (w * dpr), 1 / (h * dpr));
  };
  resize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());

  return { composer, bloom, resize };
}
