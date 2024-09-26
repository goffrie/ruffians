import React, { useRef, useEffect, PropsWithChildren, useCallback } from "react";

const FX_FPS = 90;

enum ParticleBufferOffset {
    TTL = 0,
    X = 1,
    Y = 2,
    ANGLE = 3,
    DX = 4,
    DY = 5,
    DANGLE = 6,
    T0 = 7,
    LENGTH = 8,
}

type ParticleSystemConfig = {
    maxParticles: number;
    particleLifespanS: number;
    gravity?: number; // pixels/s^2
    drag: number; // s^-1
};

type ParticleInfo = {
    idx: number;
    ttl: number;
    x: number;
    y: number;
    angle: number;
};

class ParticleSystem {
    maxParticles: number;
    particleLifespan: number;
    gravity: number;
    drag: number;
    numParticles: number;
    startOffset: number;
    particleBuffer: Float32Array;

    constructor({ maxParticles, particleLifespanS, gravity, drag }: ParticleSystemConfig) {
        this.maxParticles = maxParticles;
        this.particleLifespan = particleLifespanS;
        this.gravity = gravity ?? 0;
        this.drag = drag;
        this.numParticles = 0;
        this.startOffset = 0;
        this.particleBuffer = new Float32Array(maxParticles * ParticleBufferOffset.LENGTH);
    }

    public addParticle(x: number, y: number, angle: number, dx: number, dy: number, dangle: number, time: number) {
        const particleOffset =
            ((this.startOffset + this.numParticles) % this.maxParticles) * ParticleBufferOffset.LENGTH;
        this.particleBuffer[particleOffset + ParticleBufferOffset.TTL] = this.particleLifespan;
        this.particleBuffer[particleOffset + ParticleBufferOffset.X] = x;
        this.particleBuffer[particleOffset + ParticleBufferOffset.Y] = y;
        this.particleBuffer[particleOffset + ParticleBufferOffset.ANGLE] = angle;
        this.particleBuffer[particleOffset + ParticleBufferOffset.DX] = dx;
        this.particleBuffer[particleOffset + ParticleBufferOffset.DY] = dy;
        this.particleBuffer[particleOffset + ParticleBufferOffset.DANGLE] = dangle;
        this.particleBuffer[particleOffset + ParticleBufferOffset.T0] = time;
        if (this.numParticles + 1 > this.maxParticles) {
            this.startOffset += 1;
            this.numParticles = this.maxParticles;
        } else {
            this.numParticles += 1;
        }
    }

    public forEachParticle(time: number, cb: (particle: ParticleInfo) => void) {
        const { drag, gravity } = this;
        for (let i = 0; i < this.numParticles; i++) {
            const idx = (this.startOffset + i) % this.maxParticles;
            const particleOffset = idx * ParticleBufferOffset.LENGTH;
            const t0 = this.particleBuffer[particleOffset + ParticleBufferOffset.T0];
            const t = time - t0;
            const ttl = this.particleBuffer[particleOffset + ParticleBufferOffset.TTL] - t;
            if (ttl < 0) continue;
            const expt = Math.expm1(drag * t);
            const x0 = this.particleBuffer[particleOffset + ParticleBufferOffset.X];
            const dx0 = this.particleBuffer[particleOffset + ParticleBufferOffset.DX];
            const x = dx0 * expt / drag + x0;
            const y0 = this.particleBuffer[particleOffset + ParticleBufferOffset.Y];
            const dy0 = this.particleBuffer[particleOffset + ParticleBufferOffset.DY];
            const y = ((dy0 + gravity / drag) * expt - gravity * t) / drag + y0;
            const angle = this.particleBuffer[particleOffset + ParticleBufferOffset.ANGLE] + time * this.particleBuffer[particleOffset + ParticleBufferOffset.DANGLE];
            cb({ idx, ttl, x, y, angle });
        }
    }
}

interface Emitter {
    render: (gfx: CanvasRenderingContext2D, time: number) => number;
}

class ConfettiEmitter {
    particleSystem: ParticleSystem;

    constructor() {
        this.particleSystem = new ParticleSystem({
            maxParticles: 10_000,
            particleLifespanS: 8,
            gravity: 1_000,
            drag: -3,
        });
    }

    public shootConfetti(x: number, y: number, angle: number, power: number, time: number) {
        for (let i = 0; i < 600; i++) {
            const angleDeviation = Math.PI * 0.8 * (Math.random() - 0.5);
            const powerDeviation = -0.95 * Math.random() * power;
            this.particleSystem.addParticle(
                x,
                y,
                Math.random() * Math.PI * 2,
                Math.cos(angle + angleDeviation) * (power + powerDeviation),
                Math.sin(angle + angleDeviation) * (power + powerDeviation),
                (Math.random() - 0.5) * 4,
                time
            );
        }
    }

    public render(gfx: CanvasRenderingContext2D, time: number): number {
        let particles = 0;
        this.particleSystem.forEachParticle(time, ({ idx, ttl, x, y, angle }) => {
            const alpha = Math.min(ttl, 1.0);
            gfx.fillStyle = `rgba(${
                ["168,100,253", "41,205,255", "120,255,68", "255,113,141", "253,255,106"][idx % 5]
            },${alpha})`;
            const xOffset = Math.sin(angle) * 30;
            gfx.translate(x + xOffset, y);
            gfx.rotate(angle);
            gfx.fillRect(-5, -3, 10, 6);
            gfx.resetTransform();
            particles += 1;
        });
        return particles;
    }
}

type FxState = {
    canvas: HTMLCanvasElement;
    gfx: CanvasRenderingContext2D;
    emitters: Array<Emitter>;
    active: boolean; // false when destroyed
    paused: boolean;
    lastRender: number | null;
};

type FxContext = {
    shootConfetti: (x: number, y: number, angle: number) => void;
};

export const FxContext = React.createContext<FxContext>({ shootConfetti: () => {} });

export const FxProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const confettiRef = useRef<(x: number, y: number, angle: number) => void>();
    useEffect(() => {
        if (canvasRef.current === null) {
            return;
        }
        const fx = createFxContext(canvasRef.current);
        if (fx === null) {
            return;
        }
        const confettiEmitter = new ConfettiEmitter();
        fx.emitters.push(confettiEmitter);
        confettiRef.current = (x: number, y: number, angle: number) => {
            confettiEmitter.shootConfetti(x, y, angle, 6000, document.timeline.currentTime as number / 1000);
            startFxLoop(fx);
        };
        return () => {
            fx.active = false;
        };
    }, []);

    const shootConfetti = useCallback(
        (x: number, y: number, angle: number) => {
            confettiRef.current?.(x, y, angle);
        },
        [confettiRef]
    );

    return (
        <FxContext.Provider value={{ shootConfetti }}>
            <canvas ref={canvasRef} style={{ top: 0, left: 0, position: "fixed", pointerEvents: "none" }}></canvas>
            {children}
        </FxContext.Provider>
    );
};

function startFxLoop(fx: FxState) {
    if (!fx.paused) return;
    fx.paused = false;
    const loopImpl = (nowMs: number | null) => {
        if (!fx.active) {
            return;
        }
        const now = (nowMs ?? document.timeline.currentTime) as number / 1000;
        if (fx.lastRender == null || now - fx.lastRender > 1 / FX_FPS) {
            fx.lastRender = now;
            // Throttle animation, since this is just silly effect
            if (!renderFxFrame(fx, now)) {
                // No particles left, stop looping.
                fx.paused = true;
                return;
            }
        }
        requestAnimationFrame(loopImpl);
    };
    loopImpl(null);
}

function createFxContext(canvas: HTMLCanvasElement): FxState | null {
    const gfx = canvas.getContext("2d");
    if (gfx === null) {
        return null;
    }
    return { canvas, gfx, emitters: [], active: true, lastRender: null, paused: true };
}

function renderFxFrame(fx: FxState, time: number): number {
    const width = window.innerWidth;
    const height = window.innerHeight;
    fx.canvas.width = width;
    fx.canvas.height = height;
    fx.gfx.clearRect(0, 0, width, height);

    let particles = 0;
    for (const emitter of fx.emitters) {
        particles += emitter.render(fx.gfx, time);
    }

    return particles;
}
