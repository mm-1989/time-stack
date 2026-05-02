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

  // 強い bloom: emissive の粒・フラッシュ・腰ライトを発光体として強調
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.85, // strength
    0.6, // radius
    0.18, // threshold (低めで多くの中輝度が拾われる)
  );
  composer.addPass(bloom);

  // Vignette: 周辺減光で視線を中央へ誘導
  const vignettePass = new ShaderPass(VignetteShader);
  vignettePass.uniforms.offset.value = 0.95;
  vignettePass.uniforms.darkness.value = 1.4;
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
