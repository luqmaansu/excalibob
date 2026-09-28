import { EVENT, viewportCoordsToSceneCoords } from "@excalidraw/common";

import { withBatchedUpdates, withBatchedUpdatesThrottled } from "../reactUtils";

import type React from "react";
import type App from "./App";

/** Maximum tilt in degrees in each axis. */
const MAX_TILT = 30;

/** How many degrees of tilt per pixel of drag. */
const TILT_SENSITIVITY = 0.3;

/**
 * Alt+drag tilt controller — dragging the canvas while Alt is held
 * updates tiltX/tiltY in appState, producing a 2.5D parallax effect.
 */
export class AppTilt {
  private active = false;
  private teardown: (() => void) | null = null;

  constructor(private app: App) {}

  isActive = () => this.active;

  end = () => {
    this.teardown?.();
  };

  /**
   * Starts a tilt session if the pointer event qualifies (Alt held, main
   * button, on empty canvas).
   * Returns true if the session was started.
   */
  start = (event: React.PointerEvent<HTMLElement> | PointerEvent): boolean => {
    if (!event.altKey || event.button !== 0 || this.active) {
      return false;
    }

    // Alt+drag on an element is Excalidraw's duplicate-drag — leave it alone
    // and tilt only when the drag starts on empty canvas.
    const { x, y } = viewportCoordsToSceneCoords(event, this.app.state);
    if (this.app.getElementAtPosition(x, y)) {
      return false;
    }

    this.active = true;

    const { clientX: startX, clientY: startY } = event;
    const startTiltX = this.app.state.tiltX;
    const startTiltY = this.app.state.tiltY;

    const onPointerMove = withBatchedUpdatesThrottled((e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newTiltY = Math.max(
        -MAX_TILT,
        Math.min(MAX_TILT, startTiltY + dx * TILT_SENSITIVITY),
      );
      const newTiltX = Math.max(
        -MAX_TILT,
        Math.min(MAX_TILT, startTiltX + dy * TILT_SENSITIVITY),
      );

      this.app.setState({ tiltX: newTiltX, tiltY: newTiltY });
    });

    const teardown = withBatchedUpdates(() => {
      this.teardown = null;
      this.active = false;
      this.app.ownerWindow.removeEventListener(
        EVENT.POINTER_MOVE,
        onPointerMove,
      );
      this.app.ownerWindow.removeEventListener(EVENT.POINTER_UP, teardown);
      this.app.ownerWindow.removeEventListener(EVENT.BLUR, teardown);
      onPointerMove.flush();
    });

    this.teardown = teardown;
    this.app.ownerWindow.addEventListener(EVENT.POINTER_MOVE, onPointerMove, {
      passive: true,
    });
    this.app.ownerWindow.addEventListener(EVENT.POINTER_UP, teardown);
    this.app.ownerWindow.addEventListener(EVENT.BLUR, teardown);

    event.preventDefault();
    return true;
  };
}
