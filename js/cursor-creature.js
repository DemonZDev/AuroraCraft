/**
 * AuroraCraft - Interactive Cursor Creature
 * A procedural skeletal lizard-like creature that follows the cursor
 * Optimized for 60fps performance with requestAnimationFrame
 */

class CursorCreature {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');

        // Creature configuration
        this.config = {
            segmentCount: 20,
            segmentLength: 12,
            headSize: 8,
            bodyWidth: 6,
            tailWidth: 2,

            // Physics
            followSpeed: 0.08,
            turnSpeed: 0.15,
            dampening: 0.92,
            springStrength: 0.3,

            // Colors
            primaryColor: '#9333ea',
            secondaryColor: '#06b6d4',
            glowColor: 'rgba(147, 51, 234, 0.3)',
            eyeColor: '#ffffff',

            // Glow
            glowRadius: 30,
            glowIntensity: 0.4,
        };

        // State
        this.segments = [];
        this.target = { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0 };
        this.isMoving = false;
        this.lastMoveTime = 0;
        this.speed = 0;

        // Animation
        this.animationId = null;
        this.lastTime = 0;
        this.breathePhase = 0;

        // Touch support
        this.isTouchDevice = 'ontouchstart' in window;

        this.init();
    }

    init() {
        this.resize();
        this.createSegments();
        this.bindEvents();
        this.start();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        this.ctx.scale(dpr, dpr);

        // Set initial target to center
        if (this.segments.length === 0) {
            this.target.x = window.innerWidth / 2;
            this.target.y = window.innerHeight / 2;
        }
    }

    createSegments() {
        const { segmentCount, segmentLength } = this.config;
        const startX = window.innerWidth / 2;
        const startY = window.innerHeight / 2;

        this.segments = [];
        for (let i = 0; i < segmentCount; i++) {
            this.segments.push({
                x: startX - i * segmentLength,
                y: startY,
                angle: 0,
                targetAngle: 0,
                velocity: { x: 0, y: 0 },
            });
        }
    }

    bindEvents() {
        // Mouse events
        document.addEventListener('mousemove', (e) => {
            this.target.x = e.clientX;
            this.target.y = e.clientY;
            this.isMoving = true;
            this.lastMoveTime = Date.now();
        });

        // Touch events
        document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                this.target.x = e.touches[0].clientX;
                this.target.y = e.touches[0].clientY;
                this.isMoving = true;
                this.lastMoveTime = Date.now();
            }
        }, { passive: true });

        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                this.target.x = e.touches[0].clientX;
                this.target.y = e.touches[0].clientY;
                this.isMoving = true;
                this.lastMoveTime = Date.now();
            }
        }, { passive: true });

        // Resize
        window.addEventListener('resize', () => this.resize());

        // Visibility change - pause when hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop();
            } else {
                this.start();
            }
        });
    }

    start() {
        if (this.animationId) return;
        this.lastTime = performance.now();
        this.animate();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    animate(currentTime = 0) {
        this.animationId = requestAnimationFrame((t) => this.animate(t));

        // Calculate delta time for smooth animation
        const deltaTime = Math.min((currentTime - this.lastTime) / 16.67, 2);
        this.lastTime = currentTime;

        // Check if cursor stopped moving
        if (Date.now() - this.lastMoveTime > 100) {
            this.isMoving = false;
        }

        this.update(deltaTime);
        this.render();
    }

    update(deltaTime) {
        const { followSpeed, dampening, springStrength, segmentLength, turnSpeed } = this.config;

        if (this.segments.length === 0) return;

        // Update breathe animation
        this.breathePhase += 0.03 * deltaTime;

        // Head follows target
        const head = this.segments[0];
        const dx = this.target.x - head.x;
        const dy = this.target.y - head.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate speed for visual effects
        this.speed = distance * 0.1;

        // Move head towards target with easing
        const adjustedSpeed = followSpeed * deltaTime;
        head.velocity.x += dx * adjustedSpeed;
        head.velocity.y += dy * adjustedSpeed;
        head.velocity.x *= dampening;
        head.velocity.y *= dampening;

        head.x += head.velocity.x;
        head.y += head.velocity.y;

        // Calculate head angle
        if (distance > 1) {
            head.targetAngle = Math.atan2(dy, dx);
        }

        // Smooth angle interpolation
        let angleDiff = head.targetAngle - head.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        head.angle += angleDiff * turnSpeed * deltaTime;

        // Update body segments with IK-like following
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const parent = this.segments[i - 1];

            // Calculate desired position behind parent
            const targetX = parent.x - Math.cos(parent.angle) * segmentLength;
            const targetY = parent.y - Math.sin(parent.angle) * segmentLength;

            // Spring physics
            const sdx = targetX - segment.x;
            const sdy = targetY - segment.y;

            segment.velocity.x += sdx * springStrength * deltaTime;
            segment.velocity.y += sdy * springStrength * deltaTime;
            segment.velocity.x *= dampening;
            segment.velocity.y *= dampening;

            segment.x += segment.velocity.x;
            segment.y += segment.velocity.y;

            // Update angle to point towards parent
            const angleToPar = Math.atan2(parent.y - segment.y, parent.x - segment.x);
            let segAngleDiff = angleToPar - segment.angle;
            while (segAngleDiff > Math.PI) segAngleDiff -= Math.PI * 2;
            while (segAngleDiff < -Math.PI) segAngleDiff += Math.PI * 2;
            segment.angle += segAngleDiff * turnSpeed * 0.8 * deltaTime;
        }
    }

    render() {
        const ctx = this.ctx;
        const { segmentCount, headSize, bodyWidth, tailWidth, primaryColor, secondaryColor, glowColor, eyeColor, glowRadius, glowIntensity } = this.config;

        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.segments.length === 0) return;

        // Draw glow
        const head = this.segments[0];
        const gradient = ctx.createRadialGradient(
            head.x, head.y, 0,
            head.x, head.y, glowRadius + this.speed * 2
        );
        gradient.addColorStop(0, `rgba(147, 51, 234, ${glowIntensity})`);
        gradient.addColorStop(0.5, `rgba(6, 182, 212, ${glowIntensity * 0.5})`);
        gradient.addColorStop(1, 'rgba(147, 51, 234, 0)');

        ctx.beginPath();
        ctx.arc(head.x, head.y, glowRadius + this.speed * 2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw body segments (from tail to head)
        for (let i = this.segments.length - 1; i >= 0; i--) {
            const segment = this.segments[i];
            const progress = i / (segmentCount - 1);
            const inverseProgress = 1 - progress;

            // Calculate segment width with breathing effect
            const breathe = Math.sin(this.breathePhase + i * 0.3) * 0.15;
            let width = tailWidth + (bodyWidth - tailWidth) * progress;
            width *= (1 + breathe);

            // Head is larger
            if (i === 0) {
                width = headSize;
            }

            // Create gradient for segment
            const segmentGradient = ctx.createLinearGradient(
                segment.x - width, segment.y,
                segment.x + width, segment.y
            );

            // Color interpolation based on position
            const r1 = 147, g1 = 51, b1 = 234;  // Purple
            const r2 = 6, g2 = 182, b2 = 212;   // Cyan

            const r = Math.round(r1 + (r2 - r1) * inverseProgress);
            const g = Math.round(g1 + (g2 - g1) * inverseProgress);
            const b = Math.round(b1 + (b2 - b1) * inverseProgress);

            const color = `rgb(${r}, ${g}, ${b})`;
            const colorLight = `rgba(${r}, ${g}, ${b}, 0.8)`;
            const colorDark = `rgba(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.6)}, 1)`;

            // Draw segment body
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, width, 0, Math.PI * 2);

            const fillGradient = ctx.createRadialGradient(
                segment.x - width * 0.3, segment.y - width * 0.3, 0,
                segment.x, segment.y, width
            );
            fillGradient.addColorStop(0, colorLight);
            fillGradient.addColorStop(0.7, color);
            fillGradient.addColorStop(1, colorDark);

            ctx.fillStyle = fillGradient;
            ctx.fill();

            // Draw segment outline
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * progress})`;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw connecting lines between segments
            if (i > 0) {
                const nextSeg = this.segments[i - 1];
                const nextWidth = i === 1 ? headSize : tailWidth + (bodyWidth - tailWidth) * ((i - 1) / (segmentCount - 1));

                ctx.beginPath();
                ctx.moveTo(segment.x, segment.y);
                ctx.lineTo(nextSeg.x, nextSeg.y);
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
                ctx.lineWidth = Math.min(width, nextWidth) * 0.8;
                ctx.lineCap = 'round';
                ctx.stroke();
            }

            // Draw eyes on head
            if (i === 0) {
                const eyeOffset = headSize * 0.4;
                const eyeSize = headSize * 0.25;
                const pupilSize = eyeSize * 0.6;

                // Calculate eye positions based on head angle
                const leftEyeAngle = segment.angle + Math.PI * 0.3;
                const rightEyeAngle = segment.angle - Math.PI * 0.3;

                const leftEyeX = segment.x + Math.cos(leftEyeAngle) * eyeOffset;
                const leftEyeY = segment.y + Math.sin(leftEyeAngle) * eyeOffset;
                const rightEyeX = segment.x + Math.cos(rightEyeAngle) * eyeOffset;
                const rightEyeY = segment.y + Math.sin(rightEyeAngle) * eyeOffset;

                // Draw eye whites
                ctx.beginPath();
                ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
                ctx.fillStyle = eyeColor;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
                ctx.fillStyle = eyeColor;
                ctx.fill();

                // Draw pupils (looking towards target)
                const lookAngle = Math.atan2(this.target.y - head.y, this.target.x - head.x);
                const pupilOffset = eyeSize * 0.3;

                ctx.beginPath();
                ctx.arc(
                    leftEyeX + Math.cos(lookAngle) * pupilOffset,
                    leftEyeY + Math.sin(lookAngle) * pupilOffset,
                    pupilSize, 0, Math.PI * 2
                );
                ctx.fillStyle = '#1a1a2e';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(
                    rightEyeX + Math.cos(lookAngle) * pupilOffset,
                    rightEyeY + Math.sin(lookAngle) * pupilOffset,
                    pupilSize, 0, Math.PI * 2
                );
                ctx.fillStyle = '#1a1a2e';
                ctx.fill();

                // Eye highlights
                ctx.beginPath();
                ctx.arc(
                    leftEyeX - eyeSize * 0.2,
                    leftEyeY - eyeSize * 0.2,
                    pupilSize * 0.3, 0, Math.PI * 2
                );
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(
                    rightEyeX - eyeSize * 0.2,
                    rightEyeY - eyeSize * 0.2,
                    pupilSize * 0.3, 0, Math.PI * 2
                );
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fill();
            }

            // Draw small legs on middle segments
            if (i > 2 && i < segmentCount - 3 && i % 4 === 0) {
                const legLength = width * 2;
                const legAngle = segment.angle + Math.PI / 2;

                // Left leg
                const wave = Math.sin(this.breathePhase * 2 + i) * 0.3;
                const leftLegEndX = segment.x + Math.cos(legAngle + wave) * legLength;
                const leftLegEndY = segment.y + Math.sin(legAngle + wave) * legLength;

                ctx.beginPath();
                ctx.moveTo(segment.x, segment.y);
                ctx.lineTo(leftLegEndX, leftLegEndY);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Right leg
                const rightLegEndX = segment.x + Math.cos(legAngle + Math.PI - wave) * legLength;
                const rightLegEndY = segment.y + Math.sin(legAngle + Math.PI - wave) * legLength;

                ctx.beginPath();
                ctx.moveTo(segment.x, segment.y);
                ctx.lineTo(rightLegEndX, rightLegEndY);
                ctx.stroke();
            }
        }

        // Draw tail fin
        const tail = this.segments[this.segments.length - 1];
        const tailAngle = tail.angle + Math.PI;
        const finSize = tailWidth * 3;
        const finWave = Math.sin(this.breathePhase * 3) * 0.5;

        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.quadraticCurveTo(
            tail.x + Math.cos(tailAngle + finWave) * finSize * 1.5,
            tail.y + Math.sin(tailAngle + finWave) * finSize * 1.5,
            tail.x + Math.cos(tailAngle) * finSize * 2,
            tail.y + Math.sin(tailAngle) * finSize * 2
        );
        ctx.strokeStyle = secondaryColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.cursorCreature = new CursorCreature('creature-canvas');
});
