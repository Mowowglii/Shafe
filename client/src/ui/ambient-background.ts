const strandCount = 30;
const sampleCount = 88;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function initializeAmbientBackground(): void {
    const canvas = document.getElementById("ambient-background");
    if (!(canvas instanceof HTMLCanvasElement)) {
        console.error("Ambient background canvas is missing");
        return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
        console.error("Could not initialize the ambient background canvas");
        return;
    }

    let width = 0;
    let height = 0;
    let frameId = 0;
    let previousFrame = 0;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let targetPointerX = 0.5;
    let targetPointerY = 0.5;
    let pointerActive = false;

    const resize = (): void => {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        if (reducedMotion.matches) {
            draw(0);
        }
    };

    const draw = (time: number): void => {
        context.clearRect(0, 0, width, height);
        pointerX += (targetPointerX - pointerX) * 0.045;
        pointerY += (targetPointerY - pointerY) * 0.045;

        const cursorX = pointerX * width;
        const cursorY = pointerY * height;
        const phase = reducedMotion.matches ? 0 : time * 0.00018;

        for (let strand = 0; strand < strandCount; strand += 1) {
            const offset = strand / (strandCount - 1);
            const centerY = height * (0.15 + offset * 0.7);
            const amplitude = height * (0.055 + (strand % 5) * 0.008);
            const isGold = strand % 8 === 0;
            context.beginPath();
            context.lineWidth = strand % 6 === 0 ? 1 : 0.65;
            context.strokeStyle = isGold
                ? `rgba(210, 164, 91, ${0.105 + (strand % 3) * 0.018})`
                : `rgba(107, 174, 139, ${0.07 + (strand % 4) * 0.012})`;
            let glowX = 0;
            let glowY = 0;

            for (let sample = 0; sample <= sampleCount; sample += 1) {
                const progress = sample / sampleCount;
                const x = progress * width;
                const baseY = centerY
                    + Math.sin(progress * Math.PI * 2.1 + strand * 0.37 + phase) * amplitude
                    + Math.sin(progress * Math.PI * 4.2 - strand * 0.19 - phase * 0.65) * amplitude * 0.18;
                const distanceX = x - cursorX;
                const distanceY = baseY - cursorY;
                const distance = Math.hypot(distanceX, distanceY);
                const cursorRipple = pointerActive && !reducedMotion.matches
                    ? Math.sin(distance * 0.025 - time * 0.004) * Math.exp(-distance / 190) * 24
                    : 0;
                const y = baseY + cursorRipple;

                if (sample === 0) {
                    context.moveTo(x, y);
                } else {
                    context.lineTo(x, y);
                }

                if (sample === Math.round(((strand * 17) % sampleCount))) {
                    glowX = x;
                    glowY = y;
                }
            }
            context.stroke();
            drawGlow(context, glowX, glowY, isGold);
        }
    };

    const drawGlow = (canvasContext: CanvasRenderingContext2D, x: number, y: number, gold: boolean): void => {
        const color = gold ? "210, 164, 91" : "107, 201, 157";
        const glow = canvasContext.createRadialGradient(x, y, 0, x, y, 12);
        glow.addColorStop(0, `rgba(${color}, 0.6)`);
        glow.addColorStop(0.16, `rgba(${color}, 0.18)`);
        glow.addColorStop(1, `rgba(${color}, 0)`);
        canvasContext.fillStyle = glow;
        canvasContext.beginPath();
        canvasContext.arc(x, y, 12, 0, Math.PI * 2);
        canvasContext.fill();
    };

    const animate = (time: number): void => {
        frameId = 0;
        if (time - previousFrame >= 1000 / 30) {
            previousFrame = time;
            draw(time);
        }
        if (!reducedMotion.matches && !document.hidden) {
            frameId = window.requestAnimationFrame(animate);
        }
    };

    const startAnimation = (): void => {
        if (frameId === 0 && !reducedMotion.matches && !document.hidden) {
            frameId = window.requestAnimationFrame(animate);
        } else if (reducedMotion.matches) {
            draw(0);
        }
    };

    const updatePointer = (event: PointerEvent): void => {
        targetPointerX = event.clientX / Math.max(width, 1);
        targetPointerY = event.clientY / Math.max(height, 1);
        pointerActive = true;
    };

    const resetPointer = (): void => {
        targetPointerX = 0.5;
        targetPointerY = 0.5;
        pointerActive = false;
    };

    resize();
    startAnimation();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("pointerout", (event) => {
        if (!event.relatedTarget) {
            resetPointer();
        }
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            if (frameId !== 0) {
                window.cancelAnimationFrame(frameId);
                frameId = 0;
            }
        } else {
            previousFrame = 0;
            startAnimation();
        }
    });
    reducedMotion.addEventListener("change", () => {
        if (reducedMotion.matches) {
            if (frameId !== 0) {
                window.cancelAnimationFrame(frameId);
                frameId = 0;
            }
            draw(0);
        } else {
            previousFrame = 0;
            startAnimation();
        }
    });
}
