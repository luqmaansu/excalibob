import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { Scene } from "@excalidraw/element";

import DragInput from "./DragInput";

import type { DragInputCallbackType } from "./DragInput";
import type { AppState } from "../../types";

interface ZDepthProps {
  element: NonDeletedExcalidrawElement;
  scene: Scene;
  appState: AppState;
  property: "zDepth";
}

const handleZDepthChange: DragInputCallbackType<ZDepthProps["property"]> = ({
  accumulatedChange,
  originalElements,
  shouldChangeByStepSize,
  nextValue,
  scene,
}) => {
  const origElement = originalElements[0];
  if (!origElement) {
    return;
  }
  const elementsMap = scene.getNonDeletedElementsMap();
  const latestElement = elementsMap.get(origElement.id);
  if (!latestElement) {
    return;
  }

  if (nextValue !== undefined) {
    scene.mutateElement(latestElement, {
      zDepth: Math.max(0, Math.min(10, Math.round(nextValue))),
    });
    return;
  }

  const origDepth = origElement.zDepth ?? 0;
  const step = shouldChangeByStepSize ? 1 : 0.5;
  const next = Math.max(
    0,
    Math.min(10, Math.round((origDepth + accumulatedChange * step) * 2) / 2),
  );
  scene.mutateElement(latestElement, { zDepth: next });
};

const ZDepth = ({ element, scene, appState, property }: ZDepthProps) => {
  return (
    <DragInput
      label="Z"
      value={element.zDepth ?? 0}
      elements={[element]}
      dragInputCallback={handleZDepthChange}
      editable={true}
      scene={scene}
      appState={appState}
      property={property}
    />
  );
};

export default ZDepth;
