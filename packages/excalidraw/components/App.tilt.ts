import { EVENT, viewportCoordsToSceneCoords } from "@excalidraw/common";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { withBatchedUpdates, withBatchedUpdatesThrottled } from "../reactUtils";

import type React from "react";
import type { AppState } from "../types";
import type App from "./App";

/** How far the board tips back (tiltX), in degrees. Never 0 while orbiting,
 * so a drag can't drop you out of the 3D view by accident. */
const MIN_TIP = 5;
const MAX_TIP = 75;

/** How many degrees of rotation per pixel of drag. */
const TILT_SENSITIVITY = 0.3;

/** Highest layer number. */
export const MAX_LAYER = 10;

/** Height in px (at zoom 1) that each layer sits above the one below. */
export const LAYER_GAP = 36;

/** Stage geometry — TiltStage's CSS and the pointer mapping below must agree. */
export const PERSPECTIVE = 1600;
export const PERSPECTIVE_ORIGIN_Y = 0.35;

/** The angle the "3D" button opens at. */
export const DEFAULT_TILT = { tiltX: 50, tiltY: -25 };

export const isTilted = (state: { tiltX: number; tiltY: number }) =>
  state.tiltX !== 0 || state.tiltY !== 0;

/** The layer an element lives on. A bound text rides its container's layer. */
export const layerOf = (
  element: ExcalidrawElement,
  elementsMap: ReadonlyMap<string, ExcalidrawElement>,
) => {
  const container =
    "containerId" in element && element.containerId
      ? elementsMap.get(element.containerId)
      : null;
  return (container ?? element).zDepth ?? 0;
};

/** Height of a layer above the board, in screen px. */
export const layerHeight = (layer: number, zoom: number) =>
  layer * LAYER_GAP * zoom;

/**
 * Maps a point on screen to the flat-canvas point under it on the active
 * layer's plane. Inverse of the CSS in TiltStage: a board of the viewport's
 * size, rotated rotateX(tiltX) rotateZ(tiltY) about its centre, the active
 * layer lifted translateZ(h), all under `perspective` from (W/2, H*oy).
 */
export const screenToLayer = (
  sx: number,
  sy: number,
  state: Pick<
    AppState,
    "width" | "height" | "tiltX" | "tiltY" | "activeLayer" | "zoom"
  >,
) => {
  const { width: W, height: H } = state;
  const cx = W / 2;
  const cy = H / 2;
  const h = layerHeight(state.activeLayer, state.zoom.value);
  const a = (state.tiltX * Math.PI) / 180;
  const b = (state.tiltY * Math.PI) / 180;

  // ray from the eye through the screen point, relative to the board centre
  const eye = [W / 2 - cx, H * PERSPECTIVE_ORIGIN_Y - cy, PERSPECTIVE];
  const dir = [sx - cx - eye[0], sy - cy - eye[1], -PERSPECTIVE];

  // undo rotateX(a) then rotateZ(b): apply RX(-a), then RZ(-b)
  const unrotate = ([x, y, z]: number[]) => {
    const y1 = y * Math.cos(a) + z * Math.sin(a);
    const z1 = -y * Math.sin(a) + z * Math.cos(a);
    return [
      x * Math.cos(b) + y1 * Math.sin(b),
      -x * Math.sin(b) + y1 * Math.cos(b),
      z1,
    ];
  };
  const o = unrotate(eye);
  const d = unrotate(dir);

  // intersect with the layer plane z = h (in board space)
  const t = d[2] === 0 ? 0 : (h - o[2]) / d[2];
  return { x: o[0] + d[0] * t + cx, y: o[1] + d[1] * t + cy };
};

/** Toolbars, menus, dialogs: events there are UI, not canvas — never remap. */
const UI_SELECTOR =
  ".layer-ui__wrapper, .App-menu, .Island, .popover, .context-menu, " +
  ".Modal, .excalidraw-textEditorContainer, [role='dialog'], button, input";

type RemappedEvent = Event & { __excalibobRemapped?: true };

/**
 * Orbit controller + pointer remapping for the tilted-board view.
 * Vertical drag tips the board (tiltX), horizontal drag spins it (tiltY).
 */
export class AppTilt {
  private active = false;
  private teardown: (() => void) | null = null;
  private pressed = false;
  private uninstall: (() => void) | null = null;

  constructor(private app: App) {}

  isActive = () => this.active;

  end = () => {
    this.teardown?.();
  };

  /**
   * Alt+drag on empty flat canvas enters the 3D view. Alt+drag on an element
   * is Excalidraw's duplicate-drag, so that is left alone.
   * Returns true if an orbit was started.
   */
  start = (event: React.PointerEvent<HTMLElement> | PointerEvent): boolean => {
    if (!event.altKey || event.button !== 0 || this.active) {
      return false;
    }
    if (isTilted(this.app.state)) {
      return false; // in 3D, the capture listener below owns Alt+drag
    }
    const { x, y } = viewportCoordsToSceneCoords(event, this.app.state);
    if (this.app.getElementAtPosition(x, y)) {
      return false;
    }
    return this.orbit(event);
  };

  /** Starts an orbit drag from a pointer-down. */
  orbit = (event: React.PointerEvent<HTMLElement> | PointerEvent): boolean => {
    if (event.button !== 0 || this.active) {
      return false;
    }
    this.active = true;

    const { clientX: startX, clientY: startY } = event;
    const startTip = this.app.state.tiltX;
    const startSpin = this.app.state.tiltY;

    const onPointerMove = withBatchedUpdatesThrottled((e: PointerEvent) => {
      const tiltX = Math.max(
        MIN_TIP,
        Math.min(MAX_TIP, startTip - (e.clientY - startY) * TILT_SENSITIVITY),
      );
      const tiltY = startSpin + (e.clientX - startX) * TILT_SENSITIVITY;
      this.app.setState({ tiltX, tiltY });
    });

    const teardown = withBatchedUpdates(() => {
      this.teardown = null;
      this.active = false;
      this.app.ownerWindow.removeEventListener(
        EVENT.POINTER_MOVE,
        onPointerMove,
        true,
      );
      this.app.ownerWindow.removeEventListener(
        EVENT.POINTER_UP,
        teardown,
        true,
      );
      this.app.ownerWindow.removeEventListener(EVENT.BLUR, teardown);
      onPointerMove.flush();
    });

    this.teardown = teardown;
    this.app.ownerWindow.addEventListener(EVENT.POINTER_MOVE, onPointerMove, {
      passive: true,
      capture: true,
    });
    this.app.ownerWindow.addEventListener(EVENT.POINTER_UP, teardown, true);
    this.app.ownerWindow.addEventListener(EVENT.BLUR, teardown);

    event.preventDefault();
    return true;
  };

  /**
   * While tilted, every pointer event aimed at the canvas is swallowed and
   * re-fired at the flat interactive canvas with the coordinates of the
   * point it hits on the active layer — so the whole Excalidraw editor keeps
   * working, unmodified, underneath the 3D view.
   */
  install = (getCanvas: () => HTMLCanvasElement | null) => {
    const win = this.app.ownerWindow;

    const remap = (event: Event) => {
      const e = event as PointerEvent & RemappedEvent;
      if (e.__excalibobRemapped || !isTilted(this.app.state)) {
        return;
      }
      const canvas = getCanvas();
      if (!canvas) {
        return;
      }
      const target = e.target as Element | null;
      const onUI = !!target?.closest?.(UI_SELECTOR);
      const isDown =
        e.type === EVENT.POINTER_DOWN ||
        e.type === "mousedown" ||
        e.type === "dblclick" ||
        e.type === "contextmenu";

      // a drag that began on the canvas stays on the canvas, even over UI
      if (onUI && !(this.pressed && !isDown)) {
        return;
      }
      if (this.active) {
        return; // orbiting — the orbit listeners read raw coordinates
      }
      if (e.type === EVENT.POINTER_DOWN && e.altKey) {
        e.stopImmediatePropagation();
        this.orbit(e);
        return;
      }

      e.stopImmediatePropagation();
      e.preventDefault();

      const { offsetLeft, offsetTop } = this.app.state;
      const p = screenToLayer(
        e.clientX - offsetLeft,
        e.clientY - offsetTop,
        this.app.state,
      );
      const init: PointerEventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: p.x + offsetLeft,
        clientY: p.y + offsetTop,
        screenX: e.screenX,
        screenY: e.screenY,
        button: e.button,
        buttons: e.buttons,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        detail: e.detail,
      };
      if ("pointerId" in e) {
        Object.assign(init, {
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          isPrimary: e.isPrimary,
          pressure: e.pressure,
          width: e.width,
          height: e.height,
        });
      }
      const Ctor = "pointerId" in e ? PointerEvent : MouseEvent;
      const copy = new Ctor(e.type, init) as Event & RemappedEvent;
      copy.__excalibobRemapped = true;

      if (e.type === EVENT.POINTER_DOWN) {
        this.pressed = true;
      } else if (
        e.type === EVENT.POINTER_UP ||
        e.type === EVENT.POINTER_CANCEL
      ) {
        this.pressed = false;
      }
      canvas.dispatchEvent(copy);
    };

    const types = [
      EVENT.POINTER_DOWN,
      EVENT.POINTER_MOVE,
      EVENT.POINTER_UP,
      EVENT.POINTER_CANCEL,
      "dblclick",
      "contextmenu",
    ];
    types.forEach((type) => win.addEventListener(type, remap, true));
    this.uninstall = () =>
      types.forEach((type) => win.removeEventListener(type, remap, true));
  };

  destroy = () => {
    this.uninstall?.();
    this.uninstall = null;
    this.end();
  };
}
