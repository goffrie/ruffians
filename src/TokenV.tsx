import { Token } from "./gameTypes";
import * as styles from "./Game.module.css";
import { createContext, ReactElement, ReactNode, useContext, useLayoutEffect, useRef } from "react";
import { Immutable } from "mutative";

// const TokenAnimatorContext = createContext<((token: Token, target: HTMLElement, disabled: boolean, onClick?: () => void) => void) | null>(null);
type TokenLocation = { x: number; y: number };
const TokenAnimatorContext = createContext<Map<string, TokenLocation> | null>(null);
export function TokenAnimator({ children }: { children: ReactNode }) {
    const m = useRef<Map<string, TokenLocation> | null>(null);
    if (m.current == null) m.current = new Map();
    return <TokenAnimatorContext.Provider value={m.current}>{children}</TokenAnimatorContext.Provider>;
}

function tokenStr(t: Immutable<Token>): string {
    return `${t.round}-${t.index}`;
}

export type TokenProps = {
    token?: Immutable<Token> | null;
    disabled?: boolean;
    past?: boolean;
    onClick?: () => void;
};
// how 2 naming?
export function TokenV(props: TokenProps) {
    const { token, disabled, past, onClick } = props;
    const animatorContext = useContext(TokenAnimatorContext);
    const containerRef = useRef<HTMLDivElement>(null);
    const ref = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
        if (!token || !animatorContext) return;
        const name = tokenStr(token);
        if (!ref.current || !containerRef.current) return;
        const x = containerRef.current.offsetLeft;
        const y = containerRef.current.offsetTop;
        const existing = animatorContext.get(name);
        if (existing) {
            ref.current.style.transition = "";
            ref.current.style.position = "relative";
            ref.current.style.left = `${existing.x - x}px`;
            ref.current.style.top = `${existing.y - y}px`;
            ref.current.offsetLeft; // force a relayout
            ref.current.style.transition = "top 0.5s, left 0.5s";
            ref.current.style.left = "0";
            ref.current.style.top = "0";
        }
        animatorContext.set(name, { x, y });
        const observer = new ResizeObserver(() => {
            if (containerRef.current) {
                animatorContext.set(name, { x: containerRef.current.offsetLeft, y: containerRef.current.offsetTop });
            }
        });
        observer.observe(document.body);
        return () => observer.disconnect();
    }, [token, animatorContext]);
    return (
        <div className={styles.noToken} ref={containerRef}>
            {token && (
                <button
                    className={`${styles.token} ${past ? styles.pastToken : ""}`}
                    disabled={disabled}
                    onClick={onClick}
                    ref={ref}
                >
                    {token.index}
                </button>
            )}
        </div>
    );
}
