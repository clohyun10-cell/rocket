/**
 * Water Rocket 2D Canvas Renderer & Particle System
 * 로켓 비주얼 (페트병 내부 물 수면 감소), 노즐 물 분사 파티클, 고도/거리 그리드, 궤적 오버레이
 */

class RocketRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // 뷰포트 및 카메라
        this.camera = {
            x: 0,        // 월드 좌표계 x (m)
            y: 0,        // 월드 좌표계 y (m)
            scale: 12.0, // 픽셀 per 미터 (기본 1m = 12px)
            mode: 'auto' // 'auto' (추적) | 'fit' (전체) | 'free' (자유)
        };

        // 파티클 시스템
        this.particles = [];

        // 인터랙션
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cameraStart = { x: 0, y: 0 };

        // 궤적 히스토리 (오버레이용)
        this.historyTrajectories = [];
        this.showHistory = true;

        this.initEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    initEvents() {
        if (!this.canvas) return;

        // 마우스 드래그 (팬)
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
            this.camera.y = this.cameraStart.y + dy; // Y축 반전
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // 마우스 휠 (줌)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
            const newScale = Math.max(1.5, Math.min(60, this.camera.scale * zoomFactor));

            // 마우스 커서 위치를 중심으로 줌
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

    // 좌표계 변환: 월드(m, y-up) -> 스크린(px, y-down)
    worldToScreen(wx, wy) {
        const sx = (wx - this.camera.x) * this.camera.scale + this.width * 0.25;
        const sy = this.height * 0.85 - (wy - this.camera.y) * this.camera.scale;
        return { x: sx, y: sy };
    }

    screenToWorld(sx, sy) {
        const wx = (sx - this.width * 0.25) / this.camera.scale + this.camera.x;
        const wy = (this.height * 0.85 - sy) / this.camera.scale + this.camera.y;
        return { x: wx, y: wy };
    }

    setCameraMode(mode, currentRocket = null, fullSim = null) {
        this.camera.mode = mode;
        if (mode === 'fit' && fullSim) {
            this.fitTrajectory(fullSim);
        } else if (mode === 'auto' && currentRocket) {
            this.camera.x = currentRocket.x;
            this.camera.y = Math.max(0, currentRocket.y * 0.6);
            this.camera.scale = 12.0;
        }
    }

    fitTrajectory(fullSim) {
        if (!fullSim || !fullSim.metrics) return;
        const dist = Math.max(30, fullSim.metrics.flightDistance);
        const alt = Math.max(15, fullSim.metrics.maxAltitude);

        const availableW = this.width * 0.85;
        const availableH = this.height * 0.70;

        const scaleX = availableW / dist;
        const scaleY = availableH / alt;
        this.camera.scale = Math.max(1.5, Math.min(25, Math.min(scaleX, scaleY)));

        this.camera.x = dist * 0.35;
        this.camera.y = alt * 0.25;
        this.camera.mode = 'fit';
    }

    addHistoryTrajectory(historyItem) {
        this.historyTrajectories.push(historyItem);
        // 최근 6개 유지
        if (this.historyTrajectories.length > 6) {
            this.historyTrajectories.shift();
        }
    }

    clearHistory() {
        this.historyTrajectories = [];
    }

    // 파티클 생성
    spawnThrustParticles(rocket, dt) {
        if (!rocket || rocket.phase === 'ballistic' || rocket.phase === 'landed') return;

        const pitch = (rocket.pitchDeg * Math.PI) / 180;
        const count = rocket.phase === 'water' ? 8 : 4;

        // 노즐 위치 (로켓 꽁무니 뒤편)
        const nozzleDist = 0.5; // 로켓 길이의 절반
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
                alpha: 0.8
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
            p.vx *= 0.94; // 공기 저항 감쇠
            p.vy *= 0.94;
            p.life -= p.decay * dt;
            p.alpha = Math.max(0, p.life);

            if (p.life <= 0 || p.y < 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    render(currentPoint, fullSim, timeIndex) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // 카메라 자동 추적 처리
        if (this.camera.mode === 'auto' && currentPoint) {
            const targetX = currentPoint.x;
            const targetY = Math.max(0, currentPoint.y * 0.5);
            // 부드러운 스무딩
            this.camera.x += (targetX - this.camera.x) * 0.15;
            this.camera.y += (targetY - this.camera.y) * 0.15;
        }

        // 1. 하늘 배경
        this.drawSky(ctx, w, h);

        // 2. 그리드 & 눈금자
        this.drawEnvironment(ctx, fullSim);

        // 3. 이전 비행 궤적 오버레이 (히스토리)
        if (this.showHistory) {
            this.drawHistoryTrajectories(ctx);
        }

        // 4. 현재 비행 궤적선
        if (fullSim && fullSim.trajectory) {
            this.drawCurrentTrajectory(ctx, fullSim.trajectory, timeIndex);
        }

        // 5. 파티클 렌더링
        this.drawParticles(ctx);

        // 6. 발사대
        this.drawLaunchPad(ctx, fullSim ? fullSim.params.launchAngleDeg : 45);

        // 7. 로켓 본체
        if (currentPoint) {
            this.drawRocket(ctx, currentPoint, fullSim ? fullSim.params : null);
        }

        // 8. 뷰포트 HUD (좌표, 줌 레벨)
        this.drawHUD(ctx, currentPoint);
    }

    drawSky(ctx, w, h) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0c1b33');   // 짙은 남색 하늘
        grad.addColorStop(0.65, '#1e3a5f'); // 대기층
        grad.addColorStop(0.85, '#3b698e'); // 지평선 근처
        grad.addColorStop(1, '#1b2a26');   // 지면 베이스
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    drawEnvironment(ctx, fullSim) {
        // 지면선
        const ground0 = this.worldToScreen(0, 0);
        const groundRight = this.worldToScreen(1000, 0);

        // 지면 채우기
        ctx.fillStyle = '#142820';
        ctx.fillRect(0, ground0.y, this.width, this.height - ground0.y + 100);

        // 잔디 상단 라인
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, ground0.y);
        ctx.lineTo(this.width, ground0.y);
        ctx.stroke();

        // 거리 눈금자 (지면 x축 마커: 10m 단위 소눈금, 50m 단위 대눈금)
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#86efac';
        ctx.strokeStyle = 'rgba(134, 239, 172, 0.3)';
        ctx.lineWidth = 1;

        const maxDrawX = Math.max(300, fullSim ? fullSim.metrics.flightDistance * 1.3 : 150);
        for (let gx = 0; gx <= maxDrawX; gx += 10) {
            const p = this.worldToScreen(gx, 0);
            if (p.x < -50 || p.x > this.width + 50) continue;

            const isMajor = (gx % 50 === 0);
            const markerH = isMajor ? 12 : 6;

            ctx.beginPath();
            ctx.moveTo(p.x, ground0.y);
            ctx.lineTo(p.x, ground0.y + markerH);
            ctx.stroke();

            if (isMajor && gx > 0) {
                ctx.fillText(`${gx}m`, p.x, ground0.y + 24);
            }
        }

        // 고도 눈금자 (y축 마커: 10m 단위 소눈금, 50m 단위 대눈금)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#93c5fd';
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.15)';

        const maxDrawY = Math.max(100, fullSim ? fullSim.metrics.maxAltitude * 1.3 : 60);
        for (let gy = 10; gy <= maxDrawY; gy += 10) {
            const p = this.worldToScreen(0, gy);
            if (p.y < -20 || p.y > this.height + 20) continue;

            const isMajor = (gy % 50 === 0);

            // 가로 점선 그리드
            ctx.save();
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(0, p.y);
            ctx.lineTo(this.width, p.y);
            ctx.stroke();
            ctx.restore();

            if (isMajor || gy === 10 || gy === 20 || gy === 30) {
                ctx.fillText(`${gy}m`, p.x - 8, p.y + 3);
            }
        }
    }

    drawLaunchPad(ctx, angleDeg) {
        const base = this.worldToScreen(0, 0);
        const rad = (angleDeg * Math.PI) / 180;
        const rodLength = 1.0 * this.camera.scale; // 1m 레일

        ctx.save();
        // 발사대 받침대 삼각대
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(base.x - 14, base.y);
        ctx.lineTo(base.x, base.y - 12);
        ctx.lineTo(base.x + 14, base.y);
        ctx.stroke();

        // 힌지 포인트
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(base.x, base.y - 12, 4, 0, Math.PI * 2);
        ctx.fill();

        // 발사 레일 봉
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y - 12);
        const rodEndX = base.x + Math.cos(rad) * rodLength;
        const rodEndY = (base.y - 12) - Math.sin(rad) * rodLength;
        ctx.lineTo(rodEndX, rodEndY);
        ctx.stroke();

        ctx.restore();
    }

    drawCurrentTrajectory(ctx, trajectory, currentIdx) {
        if (!trajectory || trajectory.length === 0) return;

        // 1. 전체 예정 궤적선 (점선)
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let i = 0; i < trajectory.length; i++) {
            const p = this.worldToScreen(trajectory[i].x, trajectory[i].y);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.restore();

        // 2. 현재까지 지나온 실선 궤적 (네온 블루 글로우)
        const limit = Math.min(trajectory.length, currentIdx + 1);
        if (limit > 1) {
            ctx.save();
            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur = 8;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let i = 0; i < limit; i++) {
                const p = this.worldToScreen(trajectory[i].x, trajectory[i].y);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // 3. 최고점(Apex) 표시
        let maxAltPt = trajectory[0];
        for (const pt of trajectory) {
            if (pt.y > maxAltPt.y) maxAltPt = pt;
        }
        if (maxAltPt && maxAltPt.y > 1.0) {
            const ap = this.worldToScreen(maxAltPt.x, maxAltPt.y);
            ctx.save();
            ctx.fillStyle = '#f59e0b';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(ap.x, ap.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.font = '10px monospace';
            ctx.fillStyle = '#fcd34d';
            ctx.textAlign = 'center';
            ctx.fillText(`최고점 ${maxAltPt.y.toFixed(1)}m`, ap.x, ap.y - 10);
            ctx.restore();
        }
    }

    drawHistoryTrajectories(ctx) {
        if (!this.historyTrajectories || this.historyTrajectories.length === 0) return;

        ctx.save();
        for (let h = 0; h < this.historyTrajectories.length; h++) {
            const item = this.historyTrajectories[h];
            const traj = item.sim.trajectory;
            if (!traj || traj.length === 0) continue;

            ctx.strokeStyle = item.color || 'rgba(148, 163, 184, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            for (let i = 0; i < traj.length; i++) {
                const p = this.worldToScreen(traj[i].x, traj[i].y);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            // 착지 라벨
            const last = traj[traj.length - 1];
            const lp = this.worldToScreen(last.x, last.y);
            ctx.fillStyle = item.color || '#94a3b8';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${item.name} (${last.x.toFixed(0)}m)`, lp.x, lp.y - 6);
        }
        ctx.restore();
    }

    drawParticles(ctx) {
        ctx.save();
        for (const p of this.particles) {
            const pos = this.worldToScreen(p.x, p.y);
            const radius = Math.max(1, p.size * (this.camera.scale / 12));

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

            if (p.type === 'water') {
                ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha * 0.8})`;
            } else {
                ctx.fillStyle = `rgba(241, 245, 249, ${p.alpha * 0.5})`;
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
        // 화면 좌표계는 Y가 아래 방향이므로 회전각 부호 반전
        ctx.rotate(-pitchRad);

        // 로켓 스케일링 (시각적 식별성을 위한 적정 픽셀 크기 보장)
        const rocketVisualScale = Math.max(0.6, Math.min(2.0, this.camera.scale / 12));
        ctx.scale(rocketVisualScale, rocketVisualScale);

        // 로켓 치수 (가로 60px, 세로 20px)
        const L = 50;  // 동체 길이
        const R = 12;  // 동체 반경

        // 1. 투명 페트병 본체 (Bottle Body)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-L / 2, -R, L, R * 2, 4) : ctx.rect(-L / 2, -R, L, R * 2);
        ctx.fill();
        ctx.stroke();

        // 2. 내부 물 수면 표현 (Water Fill inside bottle)
        // 물이 남아있는 경우 페트병 내부에 푸른색 물 렌더링
        const bottleVol = (params ? params.bottleVolumeL : 2.0) * 1000;
        const waterRatio = Math.max(0, Math.min(1, rocket.waterVolumeMl / bottleVol));

        if (waterRatio > 0.01) {
            ctx.save();
            ctx.beginPath();
            // 물은 가속도/중력에 의해 로켓 뒤편(노즐 쪽 = -L/2)에 쏠려있음
            const waterLength = L * waterRatio;
            ctx.roundRect ? ctx.roundRect(-L / 2, -R + 1, waterLength, (R * 2) - 2, 3) : ctx.rect(-L / 2, -R + 1, waterLength, (R * 2) - 2);
            ctx.fillStyle = 'rgba(14, 165, 233, 0.75)';
            ctx.fill();

            // 물 표면 하이라이트
            ctx.strokeStyle = 'rgba(186, 230, 253, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-L / 2 + waterLength, -R + 2);
            ctx.lineTo(-L / 2 + waterLength, R - 2);
            ctx.stroke();
            ctx.restore();
        }

        // 3. 노즈콘 (Nose Cone - 앞부분 원뿔)
        ctx.fillStyle = '#ef4444'; // 붉은색 노즈콘
        ctx.strokeStyle = '#b91c1c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(L / 2, -R);
        ctx.quadraticCurveTo(L / 2 + 18, 0, L / 2 + 24, 0); // 둥근 앞코
        ctx.quadraticCurveTo(L / 2 + 18, 0, L / 2, R);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 4. 안정 날개 (Fins - 뒤편)
        ctx.fillStyle = '#f59e0b'; // 황금빛 날개
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;

        // 위쪽 날개
        ctx.beginPath();
        ctx.moveTo(-L / 2 + 5, -R);
        ctx.lineTo(-L / 2 - 8, -R - 14);
        ctx.lineTo(-L / 2 + 8, -R);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 아래쪽 날개
        ctx.beginPath();
        ctx.moveTo(-L / 2 + 5, R);
        ctx.lineTo(-L / 2 - 8, R + 14);
        ctx.lineTo(-L / 2 + 8, R);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 5. 노즐 (Nozzle - 분출구)
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        ctx.rect(-L / 2 - 4, -5, 4, 10);
        ctx.fill();
        ctx.stroke();

        // 분출 중일 때 노즐 플레임/스프레이 빛 효과
        if (rocket.phase === 'water') {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.beginPath();
            ctx.moveTo(-L / 2 - 4, -4);
            ctx.lineTo(-L / 2 - 16, 0);
            ctx.lineTo(-L / 2 - 4, 4);
            ctx.closePath();
            ctx.fill();
        } else if (rocket.phase === 'air') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath();
            ctx.arc(-L / 2 - 8, 0, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawHUD(ctx, rocket) {
        ctx.save();
        ctx.font = '11px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';

        // 좌측 상단 카메라 모드 안내
        const modeText = this.camera.mode === 'auto' ? '🎥 카메라: 로켓 자동 추적' : 
                         this.camera.mode === 'fit' ? '📐 카메라: 전체 궤적 조망' : '🖱️ 카메라: 자유 모드 (드래그/휠)';
        ctx.fillText(modeText, 14, 24);

        if (rocket) {
            // 현재 비행 상태 태그
            let phaseLabel = '대기 중';
            let phaseColor = '#94a3b8';
            if (rocket.phase === 'water') {
                phaseLabel = '💧 물 분출 가속 중 (작용-반작용 추력)';
                phaseColor = '#38bdf8';
            } else if (rocket.phase === 'air') {
                phaseLabel = '💨 고압 압축 공기 단열 팽창 분출';
                phaseColor = '#facc15';
            } else if (rocket.phase === 'ballistic') {
                phaseLabel = '🎯 관성 포물선 비행 (공기저항 감속)';
                phaseColor = '#4ade80';
            } else if (rocket.phase === 'landed') {
                phaseLabel = '🏁 지면 착지 완료';
                phaseColor = '#e2e8f0';
            }

            ctx.fillStyle = phaseColor;
            ctx.fillText(phaseLabel, 14, 42);
        }

        ctx.restore();
    }
}

// 전역 등록
if (typeof window !== 'undefined') {
    window.RocketRenderer = RocketRenderer;
}
