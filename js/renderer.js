/**
 * Water Rocket 2D Canvas Renderer & Celestial Particle System
 * - 빛과 천체(별, 십자성, 행성, 성운)가 실시간으로 반짝거리는 고급 우주 배경
 * - 애니메이션 종료 전까지 궤적/최고점 결과 예측 불가 처리
 * - 착지 완료 후 초기값, 1차 변경, 2차 변경 궤적 전체 비교 표시
 */

class RocketRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.camera = {
            x: 0,
            y: 0,
            scale: 10.5,
            mode: 'auto'
        };

        this.particles = [];
        this.isFlightStarted = false;
        this.isFlightFinished = false;

        // 반짝이는 천체(별, 십자성, 성운) 초기화
        this.stars = [];
        for (let i = 0; i < 85; i++) {
            this.stars.push({
                rx: Math.random(),
                ry: Math.random() * 0.76,
                r: 0.7 + Math.random() * 1.8,
                baseAlpha: 0.35 + Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
                speed: 1.5 + Math.random() * 3.5,
                isSparkle: i % 9 === 0, // 십자 빛망울 별
                color: i % 5 === 0 ? '#bae6fd' : (i % 7 === 0 ? '#fde68a' : '#f8fafc')
            });
        }

        // 인터랙션
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cameraStart = { x: 0, y: 0 };

        // 비교 궤적 목록 (초기값, 1차 변경, 2차 변경)
        this.historyTrajectories = [];
        this.showHistory = true;

        // 마지막 렌더 상태 캐시 (배경 천체 상시 반짝임용)
        this.lastRenderState = { point: null, sim: null, idx: 0 };

        this.initEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // 천체 반짝임 상시 루프
        this.startAmbientCelestialLoop();
    }

    startAmbientCelestialLoop() {
        const tick = () => {
            if (this.lastRenderState.point && this.lastRenderState.sim) {
                this.render(
                    this.lastRenderState.point,
                    this.lastRenderState.sim,
                    this.lastRenderState.idx
                );
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    initEvents() {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
            this.cameraStart = { x: this.camera.x, y: this.camera.y };
            this.camera.mode = 'free';
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const dx = (e.clientX - this.dragStart.x) / this.camera.scale;
            const dy = (e.clientY - this.dragStart.y) / this.camera.scale;
            this.camera.x = this.cameraStart.x - dx;
            this.camera.y = this.cameraStart.y + dy;
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
            const newScale = Math.max(1.2, Math.min(55, this.camera.scale * zoomFactor));

            const rect = this.canvas.getBoundingClientRect();
            const mouseScreenX = e.clientX - rect.left;
            const mouseScreenY = e.clientY - rect.top;

            const worldPosBefore = this.screenToWorld(mouseScreenX, mouseScreenY);
            this.camera.scale = newScale;
            const worldPosAfter = this.screenToWorld(mouseScreenX, mouseScreenY);

            this.camera.x += (worldPosBefore.x - worldPosAfter.x);
            this.camera.y += (worldPosBefore.y - worldPosAfter.y);
            this.camera.mode = 'free';
        }, { passive: false });
    }

    worldToScreen(wx, wy) {
        const sx = (wx - this.camera.x) * this.camera.scale + this.width * 0.18;
        const sy = this.height * 0.82 - (wy - this.camera.y) * this.camera.scale;
        return { x: sx, y: sy };
    }

    screenToWorld(sx, sy) {
        const wx = (sx - this.width * 0.18) / this.camera.scale + this.camera.x;
        const wy = (this.height * 0.82 - sy) / this.camera.scale + this.camera.y;
        return { x: wx, y: wy };
    }

    setFlightState(isStarted, isFinished) {
        this.isFlightStarted = isStarted;
        this.isFlightFinished = isFinished;
    }

    setCameraMode(mode, currentRocket = null, fullSim = null) {
        this.camera.mode = mode;
        if (mode === 'fit') {
            this.fitAllTrajectories(fullSim);
        } else if (mode === 'auto' && currentRocket) {
            this.camera.x = currentRocket.x;
            this.camera.y = Math.max(0, currentRocket.y * 0.5);
            this.camera.scale = 10.5;
        }
    }

    fitAllTrajectories(currentSim = null) {
        let maxDist = 40;
        let maxAlt = 20;

        if (currentSim && currentSim.metrics) {
            maxDist = Math.max(maxDist, currentSim.metrics.flightDistance);
            maxAlt = Math.max(maxAlt, currentSim.metrics.maxAltitude);
        }

        if (this.historyTrajectories && this.historyTrajectories.length > 0) {
            for (const item of this.historyTrajectories) {
                if (item.sim && item.sim.metrics) {
                    maxDist = Math.max(maxDist, item.sim.metrics.flightDistance);
                    maxAlt = Math.max(maxAlt, item.sim.metrics.maxAltitude);
                }
            }
        }

        const availableW = this.width * 0.72;
        const availableH = this.height * 0.62;

        const scaleX = availableW / maxDist;
        const scaleY = availableH / maxAlt;
        this.camera.scale = Math.max(1.4, Math.min(20, Math.min(scaleX, scaleY)));

        this.camera.x = maxDist * 0.32;
        this.camera.y = maxAlt * 0.20;
        this.camera.mode = 'fit';
    }

    setHistoryTrajectories(list) {
        this.historyTrajectories = list || [];
    }

    clearHistory() {
        this.historyTrajectories = [];
    }

    spawnThrustParticles(rocket, dt) {
        if (!rocket || rocket.phase === 'ballistic' || rocket.phase === 'landed') return;

        const pitch = (rocket.pitchDeg * Math.PI) / 180;
        const count = rocket.phase === 'water' ? 8 : 4;

        const nozzleDist = 0.5;
        const nozzleX = rocket.x - Math.cos(pitch) * nozzleDist;
        const nozzleY = rocket.y - Math.sin(pitch) * nozzleDist;

        for (let i = 0; i < count; i++) {
            const spread = (Math.random() - 0.5) * 0.35;
            const exAngle = pitch + Math.PI + spread;
            const baseSpeed = rocket.phase === 'water'
                ? (30 + Math.random() * 40)
                : (15 + Math.random() * 20);

            const pVx = Math.cos(exAngle) * baseSpeed + (rocket.vx * 0.2);
            const pVy = Math.sin(exAngle) * baseSpeed + (rocket.vy * 0.2);

            this.particles.push({
                x: nozzleX + (Math.random() - 0.5) * 0.08,
                y: nozzleY + (Math.random() - 0.5) * 0.08,
                vx: pVx,
                vy: pVy,
                life: 1.0,
                decay: rocket.phase === 'water' ? 1.8 + Math.random() * 1.5 : 2.5 + Math.random() * 2.0,
                size: rocket.phase === 'water' ? 2.5 + Math.random() * 3.5 : 3.0 + Math.random() * 4.0,
                type: rocket.phase === 'water' ? 'water' : 'air',
                alpha: 0.85
            });
        }
    }

    updateParticles(dt) {
        const C_G = 9.8;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.type === 'water') {
                p.vy -= C_G * dt * 0.5;
            }
            p.vx *= 0.94;
            p.vy *= 0.94;
            p.life -= p.decay * dt;
            p.alpha = Math.max(0, p.life);

            if (p.life <= 0 || p.y < 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    render(currentPoint, fullSim, timeIndex) {
        this.lastRenderState = { point: currentPoint, sim: fullSim, idx: timeIndex };
        if (!this.ctx || !this.width || !this.height) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        if (this.camera.mode === 'auto' && currentPoint) {
            const targetX = currentPoint.x;
            const targetY = Math.max(0, currentPoint.y * 0.48);
            this.camera.x += (targetX - this.camera.x) * 0.15;
            this.camera.y += (targetY - this.camera.y) * 0.15;
        }

        // 1. 빛과 천체가 반짝거리는 우주 배경
        this.drawSkyAndCelestials(ctx, w, h);

        // 2. 지형 및 고도/거리 눈금자
        this.drawEnvironment(ctx);

        // 3. 착지 완료 시: 초기값, 1차 변경, 2차 변경 모든 궤적 표시!
        if (this.isFlightFinished && this.showHistory) {
            this.drawAllCompletedTrajectories(ctx);
        }

        // 4. 현재 비행 중인 실시간 궤적 (예측 방지를 위해 현재 위치까지만 실선 표시)
        if (this.isFlightStarted && fullSim && fullSim.trajectory) {
            this.drawActiveTrajectory(ctx, fullSim.trajectory, timeIndex);
        }

        // 5. 물/공기 분사 파티클
        this.drawParticles(ctx);

        // 6. 발사대
        this.drawLaunchPad(ctx, fullSim ? fullSim.params.launchAngleDeg : 45);

        // 7. 로켓 본체
        if (currentPoint) {
            this.drawRocket(ctx, currentPoint, fullSim ? fullSim.params : null);
        }

        // 8. 상태 배지 HUD
        this.drawHUD(ctx, currentPoint);
    }

    drawSkyAndCelestials(ctx, w, h) {
        const now = performance.now() * 0.001;

        // 우주 그라데이션
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#040711');
        grad.addColorStop(0.45, '#0c1631');
        grad.addColorStop(0.76, '#172e5c');
        grad.addColorStop(0.90, '#1e426e');
        grad.addColorStop(1, '#0f2422');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        // 1) 은은하게 맥동하는 성운 빛 (Nebula Glow)
        const nebulaPulse = 0.12 + 0.04 * Math.sin(now * 1.2);
        const nebGrad1 = ctx.createRadialGradient(w * 0.28, h * 0.25, 5, w * 0.28, h * 0.25, w * 0.28);
        nebGrad1.addColorStop(0, `rgba(56, 189, 248, ${nebulaPulse})`);
        nebGrad1.addColorStop(0.5, `rgba(139, 92, 246, ${nebulaPulse * 0.6})`);
        nebGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebGrad1;
        ctx.fillRect(0, 0, w, h);

        // 2) 우측 상단 빛나는 행성(화성/고리 행성) 천체 효과
        const px = w * 0.84;
        const py = h * 0.22;
        const planetGlow = ctx.createRadialGradient(px, py, 4, px, py, 38 + 4 * Math.sin(now * 2));
        planetGlow.addColorStop(0, 'rgba(251, 146, 60, 0.85)');
        planetGlow.addColorStop(0.35, 'rgba(244, 63, 94, 0.35)');
        planetGlow.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = planetGlow;
        ctx.beginPath();
        ctx.arc(px, py, 42, 0, Math.PI * 2);
        ctx.fill();

        // 행성 본체
        const bodyGrad = ctx.createLinearGradient(px - 12, py - 12, px + 12, py + 12);
        bodyGrad.addColorStop(0, '#fed7aa');
        bodyGrad.addColorStop(0.5, '#fb923c');
        bodyGrad.addColorStop(1, '#be123c');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, Math.PI * 2);
        ctx.fill();

        // 행성 고리
        ctx.strokeStyle = 'rgba(253, 230, 138, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px, py, 26, 6, -0.3, 0, Math.PI * 2);
        ctx.stroke();

        // 3) 실시간 반짝이는 별들과 십자성(Sparkle Stars)
        for (const s of this.stars) {
            const twinkle = 0.5 + 0.5 * Math.sin(now * s.speed + s.phase);
            const alpha = Math.max(0.1, Math.min(1.0, s.baseAlpha * (0.4 + 0.8 * twinkle)));
            const sx = s.rx * w;
            const sy = s.ry * h;

            ctx.fillStyle = s.color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
            ctx.fill();

            if (s.isSparkle && twinkle > 0.6) {
                const len = s.r * 3.8 * twinkle;
                ctx.strokeStyle = s.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(sx - len, sy);
                ctx.lineTo(sx + len, sy);
                ctx.moveTo(sx, sy - len);
                ctx.lineTo(sx, sy + len);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    drawEnvironment(ctx) {
        const ground0 = this.worldToScreen(0, 0);

        // 지면 채우기
        ctx.fillStyle = '#0c1f1d';
        ctx.fillRect(0, ground0.y, this.width, this.height - ground0.y + 100);

        // 지면 상단 네온 에메랄드 라인
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, ground0.y);
        ctx.lineTo(this.width, ground0.y);
        ctx.stroke();

        // 거리 눈금자 (x축)
        ctx.font = '600 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#a7f3d0';
        ctx.strokeStyle = 'rgba(167, 243, 208, 0.3)';
        ctx.lineWidth = 1;

        for (let gx = 0; gx <= 500; gx += 10) {
            const p = this.worldToScreen(gx, 0);
            if (p.x < 25 || p.x > this.width - 25) continue;

            const isMajor = (gx % 50 === 0);
            const markerH = isMajor ? 8 : 4;

            ctx.beginPath();
            ctx.moveTo(p.x, ground0.y);
            ctx.lineTo(p.x, ground0.y + markerH);
            ctx.stroke();

            if (isMajor && gx > 0 && ground0.y + 18 < this.height - 2) {
                ctx.fillText(`${gx}m`, p.x, ground0.y + 18);
            }
        }

        // 고도 눈금자 (y축)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#bae6fd';
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.12)';

        for (let gy = 10; gy <= 250; gy += 10) {
            const p = this.worldToScreen(0, gy);
            if (p.y < 38 || p.y > ground0.y - 12) continue;

            const isMajor = (gy % 50 === 0);

            ctx.save();
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(0, p.y);
            ctx.lineTo(this.width, p.y);
            ctx.stroke();
            ctx.restore();

            if ((isMajor || gy === 10 || gy === 20 || gy === 30) && p.x > 36) {
                ctx.fillText(`${gy}m`, p.x - 8, p.y + 3);
            }
        }
    }

    drawLaunchPad(ctx, angleDeg) {
        const base = this.worldToScreen(0, 0);
        const rad = (angleDeg * Math.PI) / 180;
        const rodLength = 1.0 * this.camera.scale;

        ctx.save();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(base.x - 12, base.y);
        ctx.lineTo(base.x, base.y - 10);
        ctx.lineTo(base.x + 12, base.y);
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(base.x, base.y - 10, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y - 10);
        const rodEndX = base.x + Math.cos(rad) * rodLength;
        const rodEndY = (base.y - 10) - Math.sin(rad) * rodLength;
        ctx.lineTo(rodEndX, rodEndY);
        ctx.stroke();

        ctx.restore();
    }

    drawPillLabel(ctx, text, x, y, bgColor, textColor, borderColor = 'rgba(255,255,255,0.3)') {
        ctx.save();
        ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, "Pretendard", monospace';
        const textW = ctx.measureText(text).width;
        const padX = 7;
        const boxW = textW + padX * 2;
        const boxH = 19;

        const clampedX = Math.max(boxW / 2 + 6, Math.min(this.width - boxW / 2 - 6, x));
        const clampedY = Math.max(boxH + 6, Math.min(this.height - 8, y));

        const rx = clampedX - boxW / 2;
        const ry = clampedY - boxH + 4;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(rx, ry, boxW, boxH, 9) : ctx.rect(rx, ry, boxW, boxH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.fillText(text, clampedX, ry + 13);
        ctx.restore();
    }

    drawActiveTrajectory(ctx, trajectory, currentIdx) {
        if (!trajectory || trajectory.length === 0) return;

        // 비행 중에는 예측할 수 없도록 지나온 실선 궤적(0 ~ currentIdx)만 표시!
        const limit = Math.min(trajectory.length, currentIdx + 1);
        if (limit > 1) {
            ctx.save();
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i < limit; i++) {
                const p = this.worldToScreen(trajectory[i].x, trajectory[i].y);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            ctx.restore();
        }
    }

    drawAllCompletedTrajectories(ctx) {
        if (!this.historyTrajectories || this.historyTrajectories.length === 0) return;

        ctx.save();
        for (let h = 0; h < this.historyTrajectories.length; h++) {
            const item = this.historyTrajectories[h];
            const traj = item.sim.trajectory;
            if (!traj || traj.length === 0) continue;

            ctx.save();
            ctx.strokeStyle = item.color || '#94a3b8';
            ctx.lineWidth = item.isBaseline ? 2.0 : 2.8;
            if (item.isBaseline) {
                ctx.setLineDash([4, 4]);
            }
            ctx.beginPath();
            for (let i = 0; i < traj.length; i++) {
                const p = this.worldToScreen(traj[i].x, traj[i].y);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            ctx.restore();

            // 최고점 표시
            let maxAltPt = traj[0];
            for (const pt of traj) {
                if (pt.y > maxAltPt.y) maxAltPt = pt;
            }
            const ap = this.worldToScreen(maxAltPt.x, maxAltPt.y);
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(ap.x, ap.y, 4, 0, Math.PI * 2);
            ctx.fill();

            // 착지 지점 알약 라벨 (중첩 방지를 위해 계단식 배치)
            const last = traj[traj.length - 1];
            const lp = this.worldToScreen(last.x, last.y);
            const staggerY = lp.y - 10 - h * 22;
            this.drawPillLabel(
                ctx,
                `${item.name} ➔ 거리 ${last.x.toFixed(1)}m / 높이 ${maxAltPt.y.toFixed(1)}m`,
                lp.x,
                staggerY,
                'rgba(9, 13, 24, 0.92)',
                item.color,
                item.color
            );
        }
        ctx.restore();
    }

    drawParticles(ctx) {
        ctx.save();
        for (const p of this.particles) {
            const pos = this.worldToScreen(p.x, p.y);
            const radius = Math.max(1.2, p.size * (this.camera.scale / 12));

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

            if (p.type === 'water') {
                ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha * 0.85})`;
            } else {
                ctx.fillStyle = `rgba(241, 245, 249, ${p.alpha * 0.6})`;
            }
            ctx.fill();
        }
        ctx.restore();
    }

    drawRocket(ctx, rocket, params) {
        const pos = this.worldToScreen(rocket.x, rocket.y);
        const pitchRad = (rocket.pitchDeg * Math.PI) / 180;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(-pitchRad);

        const rocketVisualScale = Math.max(0.6, Math.min(1.8, this.camera.scale / 12));
        ctx.scale(rocketVisualScale, rocketVisualScale);

        const L = 48;
        const R = 11;

        // 1. 투명 페트병 본체
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-L / 2, -R, L, R * 2, 4) : ctx.rect(-L / 2, -R, L, R * 2);
        ctx.fill();
        ctx.stroke();

        // 2. 내부 물 수면 표현
        const bottleVol = (params ? params.bottleVolumeL : 2.0) * 1000;
        const waterRatio = Math.max(0, Math.min(1, rocket.waterVolumeMl / bottleVol));

        if (waterRatio > 0.01) {
            ctx.save();
            ctx.beginPath();
            const waterLength = L * waterRatio;
            ctx.roundRect ? ctx.roundRect(-L / 2, -R + 1, waterLength, (R * 2) - 2, 3) : ctx.rect(-L / 2, -R + 1, waterLength, (R * 2) - 2);
            ctx.fillStyle = 'rgba(14, 165, 233, 0.85)';
            ctx.fill();
            ctx.restore();
        }

        // 3. 노즈콘
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(L / 2, -R);
        ctx.quadraticCurveTo(L / 2 + 16, 0, L / 2 + 22, 0);
        ctx.quadraticCurveTo(L / 2 + 16, 0, L / 2, R);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 4. 안정 날개
        ctx.fillStyle = '#7dd3fc';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.3;

        ctx.beginPath();
        ctx.moveTo(-L / 2 + 5, -R);
        ctx.lineTo(-L / 2 - 7, -R - 12);
        ctx.lineTo(-L / 2 + 8, -R);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-L / 2 + 5, R);
        ctx.lineTo(-L / 2 - 7, R + 12);
        ctx.lineTo(-L / 2 + 8, R);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 5. 노즐
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.rect(-L / 2 - 4, -4, 4, 8);
        ctx.fill();

        ctx.restore();
    }

    drawHUD(ctx, rocket) {
        if (!rocket) return;
        let phaseLabel = '🚀 발사 대기 중 (결과 비공개)';
        if (this.isFlightStarted && !this.isFlightFinished) {
            if (rocket.phase === 'water') {
                phaseLabel = '💧 1단계: 물 분출 가속 (작용·반작용)';
            } else if (rocket.phase === 'air') {
                phaseLabel = '💨 2단계: 압축 공기 단열 팽창';
            } else {
                phaseLabel = '🎯 3단계: 포물선 비행 중...';
            }
        } else if (this.isFlightFinished) {
            phaseLabel = '🏁 착지 완료 · 전체 비교 궤적 공개';
        }

        ctx.save();
        ctx.font = '700 11.5px -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif';
        const tw = ctx.measureText(phaseLabel).width;
        ctx.fillStyle = 'rgba(9, 13, 24, 0.85)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(10, 10, tw + 18, 24, 7) : ctx.rect(10, 10, tw + 18, 24);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.fillText(phaseLabel, 19, 26);
        ctx.restore();
    }
}

if (typeof window !== 'undefined') {
    window.RocketRenderer = RocketRenderer;
}
