import clsx from "clsx";

import { actionShortcuts } from "../../actions";
import { useTunnels } from "../../context/tunnels";
import { ExitZenModeButton, UndoRedoActions, ZoomActions } from "../Actions";
import { useApp, useExcalidrawSetAppState } from "../App";
import { DEFAULT_TILT, MAX_LAYER, isTilted } from "../App.tilt";
import { IconButton } from "../IconButton";
import { Tooltip } from "../Tooltip";
import { HelpButton } from "../HelpButton";
import { Section } from "../Section";
import Stack from "../Stack";

import type { ActionManager } from "../../actions/manager";
import type { UIAppState } from "../../types";

/** Toggles the 3D board view (Alt+drag on empty canvas also enters it). */
/**
 * The current layer: new shapes go on it, and the 3D view edits it.
 * With shapes selected, the arrows carry them up/down along with it.
 */
const LayerStepper = ({ appState }: { appState: UIAppState }) => {
  const app = useApp();
  const setAppState = useExcalidrawSetAppState();
  const layer = appState.activeLayer;
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(MAX_LAYER, layer + delta));
    for (const el of app.scene.getSelectedElements(appState)) {
      if (!("containerId" in el && el.containerId)) {
        app.scene.mutateElement(el, { zDepth: next || undefined });
      }
    }
    setAppState({ activeLayer: next });
  };
  const carrying = Object.keys(appState.selectedElementIds).length > 0;
  const hint = carrying
    ? "Move the selection to the layer below / above"
    : "Switch to the layer below / above — new shapes go on it";
  return (
    <div className="excalibob-layer-stepper" title={hint}>
      <button
        type="button"
        aria-label="Layer down"
        disabled={layer <= 0}
        onClick={() => move(-1)}
      >
        ‹
      </button>
      <span>Layer {layer}</span>
      <button
        type="button"
        aria-label="Layer up"
        disabled={layer >= MAX_LAYER}
        onClick={() => move(1)}
      >
        ›
      </button>
    </div>
  );
};

const TiltToggleButton = ({ appState }: { appState: UIAppState }) => {
  const setAppState = useExcalidrawSetAppState();
  const tilted = isTilted(appState);
  const label = tilted
    ? "Back to the flat view"
    : "3D board view — each layer lifts off the board";
  return (
    <Tooltip label={label} delay>
      <IconButton
        type="button"
        className="excalibob-tilt-toggle"
        aria-label={label}
        onClick={() =>
          setAppState(tilted ? { tiltX: 0, tiltY: 0 } : DEFAULT_TILT)
        }
      >
        {tilted ? "Flat" : "3D"}
      </IconButton>
    </Tooltip>
  );
};

const Footer = ({
  appState,
  actionManager,
  showExitZenModeBtn,
  renderWelcomeScreen,
  defaultUIEnabled,
  zoomUIEnabled,
}: {
  appState: UIAppState;
  actionManager: ActionManager;
  showExitZenModeBtn: boolean;
  renderWelcomeScreen: boolean;
  defaultUIEnabled: boolean;
  zoomUIEnabled: boolean;
}) => {
  const { FooterCenterTunnel, WelcomeScreenHelpHintTunnel } = useTunnels();
  const app = useApp();

  return (
    <footer
      role="contentinfo"
      className="layer-ui__wrapper__footer App-menu App-menu_bottom"
    >
      {/* footer-left is not faded out in zen mode: it holds the zoom controls,
          which stay visible (chrome-less). Its children opt in individually. */}
      {(defaultUIEnabled || (zoomUIEnabled && app.isNavigationEnabled())) && (
        <div className="layer-ui__wrapper__footer-left zen-mode-transition">
          <Stack.Col gap={2}>
            <Section heading="canvasActions">
              {zoomUIEnabled && app.isNavigationEnabled() && (
                <ZoomActions renderAction={actionManager.renderAction} />
              )}
              <TiltToggleButton appState={appState} />
              <LayerStepper appState={appState} />

              {defaultUIEnabled && !appState.viewModeEnabled && (
                <UndoRedoActions
                  renderAction={actionManager.renderAction}
                  className={clsx("zen-mode-transition", {
                    "layer-ui__wrapper__footer-left--transition-bottom":
                      appState.zenModeEnabled,
                  })}
                />
              )}
            </Section>
          </Stack.Col>
        </div>
      )}
      <FooterCenterTunnel.Out />
      {(defaultUIEnabled || renderWelcomeScreen) && (
        <div
          className={clsx(
            "layer-ui__wrapper__footer-right zen-mode-transition",
            {
              "transition-right": appState.zenModeEnabled,
            },
          )}
        >
          <div style={{ position: "relative" }}>
            {renderWelcomeScreen && <WelcomeScreenHelpHintTunnel.Out />}
            {defaultUIEnabled && (
              <HelpButton
                onClick={() => actionManager.executeAction(actionShortcuts)}
              />
            )}
          </div>
        </div>
      )}
      {defaultUIEnabled && (
        <ExitZenModeButton
          actionManager={actionManager}
          showExitZenModeBtn={showExitZenModeBtn}
        />
      )}
    </footer>
  );
};

export default Footer;
Footer.displayName = "Footer";
