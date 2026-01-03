import { Preferences, usePreferences, PreferencesProvider } from "./preferencesHook";
import * as styles from "./Preferences.module.css";

type PreferencesProps = {
    onClose: () => void;
};

export function PreferencesPanel(props: PreferencesProps) {
    const { onClose } = props;
    const [preferences, setPreferences] = usePreferences();

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                <h2>Preferences</h2>
                <div className={styles.option}>
                    <input
                        type="checkbox"
                        id="fourColourSuits"
                        checked={preferences.fourColourSuits}
                        onChange={(e) => setPreferences({ fourColourSuits: e.target.checked })}
                    />
                    <label htmlFor="fourColourSuits">Four-colour suits</label>
                    <p className={styles.description}>Display each suit in a different colour.</p>
                </div>
                <button onClick={onClose}>Close</button>
            </div>
        </div>
    );
}

export { usePreferences, PreferencesProvider };
export type { Preferences };
