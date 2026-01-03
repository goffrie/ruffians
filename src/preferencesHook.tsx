import { createContext, useContext, useState, ReactNode } from "react";

export type Preferences = {
    fourColourSuits: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
    fourColourSuits: false,
};

const STORAGE_KEY = "ruffians-preferences";

function loadPreferences(): Preferences {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.error("Failed to load preferences:", e);
    }
    return DEFAULT_PREFERENCES;
}

function savePreferences(prefs: Preferences): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.error("Failed to save preferences:", e);
    }
}

type PreferencesContextType = {
    preferences: Preferences;
    setPreferences: (prefs: Partial<Preferences>) => void;
};

const PreferencesContext = createContext<PreferencesContextType | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [preferences, setPreferencesState] = useState<Preferences>(loadPreferences);

    const setPreferences = (updates: Partial<Preferences>) => {
        setPreferencesState((prev) => {
            const next = { ...prev, ...updates };
            savePreferences(next);
            return next;
        });
    };

    return (
        <PreferencesContext.Provider value={{ preferences, setPreferences }}>{children}</PreferencesContext.Provider>
    );
}

export function usePreferences(): [Preferences, (prefs: Partial<Preferences>) => void] {
    const context = useContext(PreferencesContext);
    if (!context) {
        throw new Error("usePreferences must be used within PreferencesProvider");
    }
    return [context.preferences, context.setPreferences];
}
