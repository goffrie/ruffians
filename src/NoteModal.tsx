import { useState, useEffect } from "react";
import * as styles from "./NoteModal.module.css";

type NoteModalProps = {
    round: number;
    playerName: string;
    currentNote: string;
    onSave: (note: string) => void;
    onClose: () => void;
};

export function NoteModal(props: NoteModalProps) {
    const { round, playerName, currentNote, onSave, onClose } = props;
    const [noteText, setNoteText] = useState(currentNote);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const handleSave = () => {
        onSave(noteText);
        onClose();
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                <h2>Note about {playerName}</h2>
                <p>Round {round + 1}</p>
                <textarea
                    className={styles.textarea}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add your note here..."
                    rows={5}
                    autoFocus
                />
                <div className={styles.buttons}>
                    <button onClick={handleSave}>Save</button>
                    <button onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
