import { useEffect, useState } from "react";

import { THEME } from "@excalidraw/common";
import { arrayToMap } from "@excalidraw/common";
import { getCommonBounds } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { exportToCanvas } from "../scene/export";

import {
  PERSPECTIVE,
  PERSPECTIVE_ORIGIN_Y,
  isTilted,
  layerHeight,
  layerOf,
} from "./App.tilt";

import "./TiltStage.scss";

import type { AppState, BinaryFiles } from "../types";

/** Padding around each layer image, so strokes aren't clipped at the edges. */
const LAYER_PADDING = 16;

type LayerImage = {
  z: number;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Every layer except the one being edited, rendered to images in viewport
 * coordinates (the editable layer is the live Excalidraw canvas itself). */
const renderOtherLayers = async (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): Promise<LayerImage[]> => {
  const elementsMap = arrayToMap(elements);
  const groups = new Map<number, NonDeletedExcalidrawElement[]>();
  for (const el of elements) {
    const z = layerOf(el, elementsMap);
    if (z !== appState.activeLayer) {
      groups.set(z, [...(groups.get(z) ?? []), el]);
    }
  }

  const { zoom, scrollX, scrollY } = appState;
  const images: LayerImage[] = [];
  for (const [z, group] of groups) {
    const [minX, minY, maxX, maxY] = getCommonBounds(group);
    const canvas = await exportToCanvas(
      group,
      {
        ...appState,
        exportScale: zoom.value * window.devicePixelRatio,
        exportWithDarkMode: appState.theme === THEME.DARK,
      },
      files,
      {
        exportBackground: false,
        exportPadding: LAYER_PADDING,
        viewBackgroundColor: appState.viewBackgroundColor,
      },
    );
    // scene → viewport, the same mapping the flat canvas uses
    images.push({
      z,
      url: canvas.toDataURL(),
      x: (minX - LAYER_PADDING + scrollX) * zoom.value,
      y: (minY - LAYER_PADDING + scrollY) * zoom.value,
      width: (maxX - minX + LAYER_PADDING * 2) * zoom.value,
      height: (maxY - minY + LAYER_PADDING * 2) * zoom.value,
    });
  }
  return images;
};

/**
 * Hosts the editor's canvases. Flat, it is layout-neutral. Tilted, it lays
 * the drawing on a board seen in perspective: the layer being edited is the
 * live canvas (lifted to its height), every other layer an image at its own
 * height. The DOM tree is identical in both modes so the canvases never
 * remount; App.tilt remaps pointer input onto the active layer.
 */
export const TiltStage = ({
  elements,
  sceneNonce,
  appState,
  files,
  children,
}: {
  elements: readonly NonDeletedExcalidrawElement[];
  sceneNonce: number | undefined;
  appState: AppState;
  files: BinaryFiles;
  children: React.ReactNode;
}) => {
  const tilted = isTilted(appState);
  const [images, setImages] = useState<LayerImage[]>([]);
  const { width, height, tiltX, tiltY, zoom, theme, activeLayer } = appState;

  useEffect(() => {
    if (!tilted) {
      setImages([]);
      return;
    }
    let cancelled = false;
    renderOtherLayers(elements, appState, files).then((next) => {
      if (!cancelled) {
        setImages(next);
      }
    });
    return () => {
      cancelled = true;
    };
    // only when the drawing, its framing or the edited layer changes —
    // not on every orbit step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tilted,
    sceneNonce,
    theme,
    zoom.value,
    appState.scrollX,
    appState.scrollY,
    activeLayer,
  ]);

  return (
    <div
      className={
        tilted ? "excalibob-stage excalibob-stage--tilted" : "excalibob-stage"
      }
      style={
        tilted
          ? {
              perspective: `${PERSPECTIVE}px`,
              perspectiveOrigin: `50% ${PERSPECTIVE_ORIGIN_Y * 100}%`,
            }
          : undefined
      }
    >
      <div
        className="excalibob-stage__board"
        style={
          tilted
            ? {
                width,
                height,
                background: appState.viewBackgroundColor,
                transform: `rotateX(${tiltX}deg) rotateZ(${tiltY}deg)`,
              }
            : undefined
        }
      >
        {images.map((image) => (
          <div
            key={image.z}
            className="excalibob-stage__layer"
            style={{
              left: image.x,
              top: image.y,
              width: image.width,
              height: image.height,
              transform: `translateZ(${layerHeight(image.z, zoom.value)}px)`,
              opacity: image.z > activeLayer ? 0.55 : 1,
            }}
          >
            <img src={image.url} alt="" draggable={false} />
          </div>
        ))}
        <div
          className="excalibob-stage__active"
          style={
            tilted
              ? {
                  transform: `translateZ(${layerHeight(
                    activeLayer,
                    zoom.value,
                  )}px)`,
                }
              : undefined
          }
        >
          {children}
        </div>
      </div>
      {tilted && (
        <div className="excalibob-stage__hint">
          Editing layer {activeLayer} · Alt+drag to orbit
        </div>
      )}
    </div>
  );
};
