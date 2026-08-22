"use client";

import { useEffect, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { Alignment, Fit, Layout, useRive, useViewModel, useViewModelInstance, useViewModelInstanceBoolean } from "@rive-app/react-webgl2";
import { cn } from "@/lib/utils";

// `SwitchUi Vintage` is the marketplace preview scene, including its frame.
// `Ui_dark_light` is the transparent, interactive pull-switch itself.
const ARTBOARD = "Ui_dark_light";
const STATE_MACHINE = "State Machine 1";
// The Marketplace exposes the parent component as `OnOffToggle`, while this
// transparent child artboard names its actual day/night property differently.
const THEME_PROPERTY = "SwitchDayNight";

/**
 * Bind the portal theme directly to the transparent artboard's day/night
 * property. The Rive state machine owns the cord physics; SwitchDayNight is
 * the shared source of truth for both the artwork and the portal theme.
 */
export function RiveThemeSwitch({ dark, onThemeChange }: { dark: boolean; onThemeChange: (theme: "light" | "dark") => void }) {
  const onThemeChangeRef = useRef(onThemeChange);
  const previousDarkRef = useRef(dark);
  const initialisedRef = useRef(false);
  const writingThemeRef = useRef<boolean | null>(null);

  const { rive, RiveComponent } = useRive({
    src: "/animations/theme-switch.riv",
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    shouldDisableRiveListeners: false,
    // A finger pulling the cord should control the switch rather than scroll
    // the page until it is released.
    isTouchScrollEnabled: false,
    enableMultiTouch: false,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });

  const viewModel = useViewModel(rive, { useDefault: true });
  const viewModelInstance = useViewModelInstance(viewModel, { useDefault: true, rive });
  const { value, setValue } = useViewModelInstanceBoolean(THEME_PROPERTY, viewModelInstance);
  const ready = value !== null;

  useEffect(() => {
    onThemeChangeRef.current = onThemeChange;
  }, [onThemeChange]);

  useEffect(() => {
    if (value === null) {
      initialisedRef.current = false;
      return;
    }

    if (!initialisedRef.current) {
      initialisedRef.current = true;
      previousDarkRef.current = dark;
      if (value !== dark) {
        writingThemeRef.current = dark;
        setValue(dark);
      }
      return;
    }

    // A portal-side theme change (including keyboard activation) must update
    // the Rive artwork without being mistaken for a user pull.
    if (dark !== previousDarkRef.current) {
      previousDarkRef.current = dark;
      if (value !== dark) {
        writingThemeRef.current = dark;
        setValue(dark);
      }
      return;
    }

    if (writingThemeRef.current !== null) {
      if (value === writingThemeRef.current) writingThemeRef.current = null;
      return;
    }

    // A Rive-side change came from the authored pull interaction.
    if (value !== dark) onThemeChangeRef.current(value ? "dark" : "light");
  }, [dark, setValue, value]);

  return (
    <span aria-hidden="true" className="absolute left-1/2 -top-1 h-16 w-16 -translate-x-1/2 sm:-top-5 sm:h-36 sm:w-36">
      <span className={cn("absolute top-1 grid h-11 w-full place-items-center transition-opacity duration-150 sm:top-5", ready && "opacity-0")}>
        {dark ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </span>
      <RiveComponent
        aria-hidden="true"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={cn("pointer-events-auto absolute inset-0 size-full touch-none transition-opacity duration-150", ready ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
}
