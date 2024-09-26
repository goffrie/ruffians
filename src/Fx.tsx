import React, {useRef, useEffect, PropsWithChildren, useCallback} from 'react';

const FX_FPS = 90;

enum ParticleBufferOffset {
    TTL = 0,
    X = 1,
    Y = 2,
    ANGLE = 3,
    DX = 4,
    DY = 5,
    DANGLE = 6,
    LENGTH = 7
}

type ParticleSystemConfig = {
    maxParticles: number,
    particleLifespanS:number,
    gravity?: number,
    drag?: number
};

type ParticleInfo = {
    idx: number,
    ttl: number,
    x: number,
    y: number,
    angle: number,
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
        this.drag = drag ?? 0;
        this.numParticles = 0;
        this.startOffset = 0;
        this.particleBuffer = new Float32Array(maxParticles * ParticleBufferOffset.LENGTH);
    }

    public update(deltaS: number) {
        // Count and skip dead particles
        let i = 0;
        while (i < this.numParticles) {
            const particleOffset = ((this.startOffset + i) % this.maxParticles) * ParticleBufferOffset.LENGTH;
            if (this.particleBuffer[particleOffset + ParticleBufferOffset.TTL] > deltaS) {
                break;
            }
            i++;
        }
        const numDeadParticles = i;

        // Update physics for remaining particles
        while (i < this.numParticles) {
            const decay = 1 - this.drag;
            const particleOffset = ((this.startOffset + i) % this.maxParticles) * ParticleBufferOffset.LENGTH;
            const dangle = this.particleBuffer[particleOffset + ParticleBufferOffset.DANGLE];
            this.particleBuffer[particleOffset + ParticleBufferOffset.ANGLE] += dangle * deltaS;
            this.particleBuffer[particleOffset + ParticleBufferOffset.DY] += this.gravity * deltaS;
            this.particleBuffer[particleOffset + ParticleBufferOffset.DX] *= 1.0 - this.drag;
            this.particleBuffer[particleOffset + ParticleBufferOffset.DY] *= 1.0 - this.drag;
            const dx = this.particleBuffer[particleOffset + ParticleBufferOffset.DX];
            const dy = this.particleBuffer[particleOffset + ParticleBufferOffset.DY];
            this.particleBuffer[particleOffset + ParticleBufferOffset.X] += dx * deltaS;
            this.particleBuffer[particleOffset + ParticleBufferOffset.Y] += dy * deltaS;
            this.particleBuffer[particleOffset + ParticleBufferOffset.TTL] -= deltaS;
            i++;
        }

        // Prune dead particles
        this.startOffset = (this.startOffset + numDeadParticles) % this.maxParticles;
        this.numParticles -= numDeadParticles;
    }

    public addParticle(x: number, y: number, angle: number, dx: number, dy: number, dangle: number) {
        const particleOffset = ((this.startOffset + this.numParticles) % this.maxParticles) * ParticleBufferOffset.LENGTH;
        this.particleBuffer[particleOffset + ParticleBufferOffset.TTL] = this.particleLifespan;
        this.particleBuffer[particleOffset + ParticleBufferOffset.X] = x;
        this.particleBuffer[particleOffset + ParticleBufferOffset.Y] = y;
        this.particleBuffer[particleOffset + ParticleBufferOffset.ANGLE] = angle;
        this.particleBuffer[particleOffset + ParticleBufferOffset.DX] = dx;
        this.particleBuffer[particleOffset + ParticleBufferOffset.DY] = dy;
        this.particleBuffer[particleOffset + ParticleBufferOffset.DANGLE] = dangle;
        if (this.numParticles + 1 > this.maxParticles) {
            this.startOffset += 1;
            this.numParticles = this.maxParticles;
        } else {
            this.numParticles += 1;
        }
    }

    public* listParticles(): Generator<ParticleInfo> {
        for (let i = 0; i < this.numParticles; i++) {
            const idx = (this.startOffset + i) % this.maxParticles;
            const particleOffset = idx * ParticleBufferOffset.LENGTH;
            const ttl = this.particleBuffer[particleOffset + ParticleBufferOffset.TTL];
            const x = this.particleBuffer[particleOffset + ParticleBufferOffset.X];
            const y = this.particleBuffer[particleOffset + ParticleBufferOffset.Y];
            const angle = this.particleBuffer[particleOffset + ParticleBufferOffset.ANGLE];
            yield { idx, ttl, x, y, angle };
        }
    }
}

interface Emitter {
    update: (deltaS: number) => void;
    render: (gfx: CanvasRenderingContext2D) => void;
}

class ConfettiEmitter {
    particleSystem: ParticleSystem;

    constructor() {
        this.particleSystem = new ParticleSystem({
            maxParticles: 10_000,
            particleLifespanS: 8,
            gravity: 1_000,
            drag: 0.2
        });
    }

    public update(deltaS: number) {
        this.particleSystem.update(deltaS);
    }

    public shootConfetti(x: number, y: number, angle: number, power: number) {
        for (let i = 0; i < 600; i++) {
            const angleDeviation = Math.PI * 0.8  * (Math.random() - 0.5);
            const powerDeviation = -0.95 * Math.random() * power;
            this.particleSystem.addParticle(x, y, Math.random() * Math.PI * 2, Math.cos(angle + angleDeviation) * (power + powerDeviation), Math.sin(angle + angleDeviation) * (power + powerDeviation), (Math.random() - 0.5) * 4);
        }
    }

    public render(gfx: CanvasRenderingContext2D) {
        for (const { idx, ttl, x, y, angle } of this.particleSystem.listParticles()) {
            const alpha = Math.min(ttl, 1.0);
            gfx.fillStyle = `rgba(${[
                '168,100,253',
                '41,205,255',
                '120,255,68',
                '255,113,141',
                '253,255,106',
            ][idx % 5]},${alpha})`;
            const xOffset = Math.sin(angle) * 30;
            gfx.translate(x + xOffset, y);
            gfx.rotate(angle);
            gfx.fillRect(-5, -3, 10, 6);
            gfx.resetTransform();
        }
    }
}

type FxState = {
    canvas: HTMLCanvasElement,
    gfx: CanvasRenderingContext2D,
    emitters: Array<Emitter>,
    active: boolean,
};

type FxContext = {
    shootConfetti: (x: number, y: number, angle: number) => void;
};

export const FxContext = React.createContext<FxContext>({shootConfetti: () => {}});

export const FxProvider: React.FC<React.PropsWithChildren> = ({children}) => {
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
            confettiEmitter.shootConfetti(x, y, angle, 18_000);
        };
        startFxLoop(fx);
        return () => {
            fx.active = false;
        }
    }, []);

    const shootConfetti = useCallback((x: number, y: number, angle: number) => {
        confettiRef.current?.(x, y, angle)
    }, [confettiRef])

    return (
        <FxContext.Provider value={{ shootConfetti }}>
            <canvas ref={canvasRef} style={{top: 0, left: 0, position: "fixed", pointerEvents: "none"}}></canvas>
            {children}
        </FxContext.Provider>
    );
};

function startFxLoop(fx: FxState) {
    let lastRenderMs = Date.now();
    const loopImpl = () => {
        if (!fx.active) {
            return;
        }
        const nowMs = Date.now();
        const timeDeltaMs = nowMs - lastRenderMs;
        if (timeDeltaMs > 1_000 / FX_FPS) {
            // Throttle animation, since this is just silly effect
            renderFxFrame(fx, timeDeltaMs / 1_000);
            lastRenderMs = nowMs;
        }
        requestAnimationFrame(loopImpl);
    };
    loopImpl();
}

function createFxContext(canvas: HTMLCanvasElement): FxState | null {
    const gfx = canvas.getContext('2d');
    if (gfx === null) {
        return null;
    }
    return { canvas, gfx, emitters: [new ConfettiEmitter()], active: true };
}

function renderFxFrame(fx: FxState, timeDeltaS: number) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    fx.canvas.width = width;
    fx.canvas.height = height;
    fx.gfx.clearRect(0, 0, width, height);

    for (const emitter of fx.emitters) {
        emitter.update(timeDeltaS);
    }
    for (const emitter of fx.emitters) {
        emitter.render(fx.gfx);
    }
}
