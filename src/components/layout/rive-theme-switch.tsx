"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Alignment, DataType, Fit, Layout, StateMachineInputType, useRive, type Rive } from "@rive-app/react-webgl2";
import { cn } from "@/lib/utils";

const ARTBOARD = "SwitchUi Vintage";
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
export function RiveThemeSwitch({ dark }: { dark: boolean }) {
  const [ready, setReady] = useState(false);
  const { rive, RiveComponent } = useRive({
    src: "/animations/theme-switch.riv",
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    shouldDisableRiveListeners: true,
    // The marketplace artboard includes generous black padding around the
    // pull-tab. Cover fills our deliberately wide control and crops that
    // artwork to the switch itself instead of shrinking it into an icon.
    layout: new Layout({ fit: Fit.Cover, alignment: Alignment.Center }),
    onRiveReady: (animation) => setReady(syncThemeState(animation, dark)),
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
        // The asset's black artboard is purely decorative. Screen blending
        // leaves black transparent over either portal theme while retaining
        // the pull-tab's coloured highlights.
        className={cn("pointer-events-none absolute inset-0 size-full mix-blend-screen transition-opacity duration-150", ready ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
}
