import * as THREE from "three";
import { Model } from "./model";
import { loadVRMAnimation } from "@/lib/VRMAnimation/loadVRMAnimation";
import { buildUrl } from "@/utils/buildUrl";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

/**
 * three.jsを使った3Dビューワー
 *
 * setup()でcanvasを渡してから使う
 */
export class Viewer {
  public isReady: boolean;
  public model?: Model;

  private _renderer?: THREE.WebGLRenderer;
  private _clock: THREE.Clock;
  private _scene: THREE.Scene;
  private _camera?: THREE.PerspectiveCamera;
  private _cameraControls?: OrbitControls;
  private _rafId: number | null = null;
  private _onResize: (() => void) | null = null;

  constructor() {
    this.isReady = false;

    // scene
    const scene = new THREE.Scene();
    this._scene = scene;

    // light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // animate
    this._clock = new THREE.Clock();
    this._clock.start();
  }

  public loadVrm(url: string, onLoaded?: () => void) {
    if (this.model?.vrm) {
      this.unloadVRM();
    }

    // gltf and vrm
    this.model = new Model(this._camera || new THREE.Object3D());
    this.model.loadVRM(url).then(async () => {
      if (!this.model?.vrm) return;

      // Disable frustum culling
      this.model.vrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });

      this._scene.add(this.model.vrm.scene);

      const vrma = await loadVRMAnimation(buildUrl("/idle_loop.vrma"));
      if (vrma) this.model.loadAnimation(vrma);

      // HACK: アニメーションの原点がずれているので再生後にカメラ位置を調整する
      requestAnimationFrame(() => {
        this.resetCamera();
      });

      onLoaded?.();
    }).catch((err) => {
      console.error("[Viewer.loadVrm] Failed to load VRM:", err);
      onLoaded?.();
    });
  }

  public unloadVRM(): void {
    if (this.model?.vrm) {
      this._scene.remove(this.model.vrm.scene);
      this.model?.unLoadVrm();
    }
  }

  /**
   * Reactで管理しているCanvasを後から設定する
   */
  public setup(canvas: HTMLCanvasElement) {
    // Guard against double-setup (Strict Mode remount).
    if (this.isReady && this._renderer?.domElement === canvas) return;

    const parentElement = canvas.parentElement;
    const width = parentElement?.clientWidth || canvas.width;
    const height = parentElement?.clientHeight || canvas.height;

    try {
      this._renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
      });
    } catch (e) {
      console.warn("WebGL not available, VRM viewer disabled", e);
      this.isReady = false;
      return;
    }

    this._renderer.outputEncoding = THREE.sRGBEncoding;
    this._renderer.setSize(width, height);
    this._renderer.setPixelRatio(window.devicePixelRatio);

    // camera — positioned for a full-body shot of a standing VRM
    // (typical VRM ~1.6m tall, feet at y=0). Target the body center
    // and pull back enough that the whole character is visible.
    this._camera = new THREE.PerspectiveCamera(30.0, width / height, 0.1, 20.0);
    this._camera.position.set(0, 0.95, 2.8);
    this._cameraControls?.target.set(0, 0.95, 0);
    this._cameraControls?.update();
    // camera controls — lock the camera so the character stays
    // framed. Allow a small amount of horizontal rotation for
    // interactivity, but disable zoom/pan entirely.
    this._cameraControls = new OrbitControls(
      this._camera,
      this._renderer.domElement
    );
    this._cameraControls.screenSpacePanning = true;
    this._cameraControls.enableZoom = false;
    this._cameraControls.enablePan = false;
    // Limit rotation so the user can't swing behind or below the
    // character — keeps the view stable and the character visible.
    this._cameraControls.minPolarAngle = THREE.MathUtils.degToRad(70);
    this._cameraControls.maxPolarAngle = THREE.MathUtils.degToRad(100);
    this._cameraControls.minAzimuthAngle = THREE.MathUtils.degToRad(-35);
    this._cameraControls.maxAzimuthAngle = THREE.MathUtils.degToRad(35);
    this._cameraControls.update();

    // Remove any previous resize listener before adding a new one
    // (guards against Strict Mode double-setup leaking listeners).
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
    }
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);

    this.isReady = true;
    this.update();
  }

  /**
   * canvasの親要素を参照してサイズを変更する
   */
  public resize() {
    if (!this._renderer) return;

    const parentElement = this._renderer.domElement.parentElement;
    if (!parentElement) return;

    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(
      parentElement.clientWidth,
      parentElement.clientHeight
    );

    if (!this._camera) return;
    this._camera.aspect =
      parentElement.clientWidth / parentElement.clientHeight;
    this._camera.updateProjectionMatrix();
  }

  /**
   * VRMが読み込まれた後、モデルのバウンディングボックスから
   * 全身が画面に収まるようにカメラを調整する。
   * （以前は頭ボーンの位置にカメラを合わせていたが、
   *   これだと半身しか映らず、ロード時にジャンプしていた）
   */
  public resetCamera() {
    if (!this._camera || !this._cameraControls || !this.model?.vrm) return;

    // Compute the bounding box of the VRM scene to frame the full body.
    const box = new THREE.Box3().setFromObject(this.model.vrm.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // If the bounding box is degenerate, fall back to defaults.
    if (size.y < 0.01 || !isFinite(size.y)) {
      this._camera.position.set(0, 0.95, 2.8);
      this._cameraControls.target.set(0, 0.95, 0);
      this._cameraControls.update();
      return;
    }

    // Frame the full body: target the vertical center of the model,
    // and compute the distance needed to fit its height in the FOV.
    const fov = THREE.MathUtils.degToRad(this._camera.fov);
    const aspect = this._camera.aspect;
    // Distance so the full height fits (account for aspect ratio).
    const halfHeight = size.y / 2;
    const distV = halfHeight / Math.tan(fov / 2);
    const distH = (size.x / 2) / (Math.tan(fov / 2) * aspect);
    const distance = Math.max(distV, distH) * 1.15; // 15% padding

    this._camera.position.set(
      center.x,
      center.y,
      center.z + distance
    );
    this._cameraControls.target.set(center.x, center.y, center.z);
    this._cameraControls.update();
  }

  public update = () => {
    this._rafId = requestAnimationFrame(this.update);
    const delta = this._clock.getDelta();
    // update vrm components
    if (this.model) {
      this.model.update(delta);
    }

    if (this._renderer && this._camera) {
      this._renderer.render(this._scene, this._camera);
    }
  };

  /**
   * Release all GPU resources, event listeners, and animation frames.
   * Safe to call multiple times.
   */
  public dispose() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
      this._onResize = null;
    }
    this.unloadVRM();
    this._cameraControls?.dispose();
    this._renderer?.dispose();
    this._renderer = undefined;
    this._camera = undefined;
    this._cameraControls = undefined;
    this.isReady = false;
  }
}
