"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Alignment, DataType, Fit, Layout, StateMachineInputType, useRive, type Rive } from "@rive-app/react-webgl2";
import { cn } from "@/lib/utils";

// The file's other artboard, `SwitchUi Vintage`, is the marketplace preview
// scene. This one is the actual transparent pull-switch control.
const ARTBOARD = "Ui_dark_light";
const STATE_MACHINE = "State Machine 1";

function syncThemeState(rive: Rive, dark: boolean) {
  // This downloaded file uses one boolean transition: false for the day state
  // and true for the night state. Prefer the conventional state-machine input,
  // then support the newer Rive data-binding representation too.
  const booleanInput = rive.stateMachineInputs(STATE_MACHINE).find((input) => input.type === StateMachineInputType.Boolean);
  if (booleanInput) {
    booleanInput.value = dark;
    return true;
  }

  const viewModel = rive.defaultViewModel();
  const instance = viewModel?.defaultInstance();
  const booleanProperty = viewModel?.properties.find((property) => property.type === DataType.boolean);
  const property = instance && booleanProperty ? instance.boolean(booleanProperty.name) : null;
  if (instance && property) {
    rive.setViewModelInstance(instance);
    property.value = dark;
    return true;
  }

  return false;
}

/**
 * A visual layer for the existing theme button. The parent button continues to
 * own the actual preference change, keyboard operation, and accessibility.
 * If this asset fails to load or no supported boolean control exists, the
 * familiar sun/moon icon remains visible instead.
 */
export function RiveThemeSwitch({ dark, onThemeChange }: { dark: boolean; onThemeChange: (theme: "light" | "dark") => void }) {
  const [ready, setReady] = useState(false);
  const { rive, RiveComponent } = useRive({
    src: "/animations/theme-switch.riv",
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    // Keep the designer's pointer listeners active: the pull-tab itself is
    // meant to be dragged, not merely shown as a decorative animation.
    isTouchScrollEnabled: true,
    // This transparent artboard has generous whitespace around the switch.
    // Cover gives it useful presence in the shallow portal header.
    layout: new Layout({ fit: Fit.Cover, alignment: Alignment.Center }),
    onRiveReady: (animation) => setReady(syncThemeState(animation, dark)),
    onStateChange: (event) => {
      const states = Array.isArray(event.data) ? event.data : [event.data];
      if (states.some((state) => typeof state === "string" && /night|nuit|dark/i.test(state))) onThemeChange("dark");
      if (states.some((state) => typeof state === "string" && /day|jour|light/i.test(state))) onThemeChange("light");
    },
  });

  useEffect(() => {
    if (rive) syncThemeState(rive, dark);
  }, [dark, rive]);

  return (
    <span aria-hidden="true" className="relative grid size-full place-items-center overflow-hidden">
      <span className={cn("transition-opacity duration-150", ready && "opacity-0")}>
        {dark ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </span>
      <RiveComponent
        aria-hidden="true"
        tabIndex={-1}
        // Let the canvas receive the drag gesture. Stopping its click from
        // bubbling prevents the outer, keyboard-accessible button from
        // immediately toggling a second time after a pull.
        onClick={(event) => event.stopPropagation()}
        className={cn("pointer-events-auto absolute inset-0 size-full transition-opacity duration-150", ready ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
}
