/**
 * Water Rocket Simulation Controller & Time Loop
 * 실시간 재생/일시정지, 배속 조절, 프레임 보간, 렌더러 및 차트 동기화
 */

class RocketSimulator {
    constructor() {
        this.fullSim = null;
        this.isPlaying = false;
        this.playbackSpeed = 1.0;
        this.currentTime = 0;
        this.lastTimestamp = null;
        this.currentIndex = 0;

        this.renderer = null;
        this.energyChart = null;
        this.kineticsChart = null;

        this.onUpdateCallback = null;
        this.onFinishCallback = null;

        this.animFrameId = null;
        this.loop = this.loop.bind(this);
    }

    setComponents(renderer, energyChart, kineticsChart) {
        this.renderer = renderer;
        this.energyChart = energyChart;
        this.kineticsChart = kineticsChart;
    }

    loadSimulation(params) {
        // 물리 엔진 시뮬레이션 1회 사전 고속 계산
        this.fullSim = RocketPhysics.simulate(params);
        this.currentTime = 0;
        this.currentIndex = 0;
        this.isPlaying = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        // 차트에 시계열 데이터 설정
        if (this.energyChart) {
            this.energyChart.setData(this.fullSim.trajectory);
        }
        if (this.kineticsChart) {
            this.kineticsChart.setData(this.fullSim.trajectory);
        }

        // 파티클 초기화
        if (this.renderer) {
            this.renderer.particles = [];
            if (this.renderer.camera.mode === 'fit') {
                this.renderer.fitTrajectory(this.fullSim);
            }
        }

        this.updateFrame(0);
        return this.fullSim;
    }

    start() {
        if (!this.fullSim) return;
        this.isPlaying = true;
        this.lastTimestamp = performance.now();
        if (!this.animFrameId) {
            this.animFrameId = requestAnimationFrame(this.loop);
        }
    }

    pause() {
        this.isPlaying = false;
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            // 끝까지 재생된 상태에서 다시 누르면 처음부터
            if (this.fullSim && this.currentTime >= this.fullSim.metrics.flightTime) {
                this.seekToTime(0);
            }
            this.start();
        }
    }

    reset() {
        this.pause();
        this.currentTime = 0;
        this.currentIndex = 0;
        if (this.renderer) {
            this.renderer.particles = [];
        }
        this.updateFrame(0);
    }

    setSpeed(speed) {
        this.playbackSpeed = Math.max(0.1, Math.min(10.0, speed));
    }

    seekToTime(t) {
        if (!this.fullSim || !this.fullSim.trajectory.length) return;
        const maxT = this.fullSim.metrics.flightTime;
        this.currentTime = Math.max(0, Math.min(maxT, t));

        // 해당 시간에 가장 가까운 인덱스 탐색 (이진 탐색)
        const traj = this.fullSim.trajectory;
        let low = 0;
        let high = traj.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (traj[mid].t < this.currentTime) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        this.currentIndex = Math.max(0, Math.min(traj.length - 1, low));
        this.updateFrame(0);
    }

    loop(timestamp) {
        if (!this.isPlaying) {
            this.animFrameId = null;
            return;
        }

        if (!this.lastTimestamp) this.lastTimestamp = timestamp;
        const deltaMs = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        // 경과 시간 (초) * 배속
        const dt = (deltaMs / 1000) * this.playbackSpeed;

        if (this.fullSim && this.fullSim.trajectory.length > 0) {
            this.currentTime += dt;
            const traj = this.fullSim.trajectory;
            const maxT = this.fullSim.metrics.flightTime;

            // 시간 기반 인덱스 전진
            while (this.currentIndex < traj.length - 1 && traj[this.currentIndex].t < this.currentTime) {
                this.currentIndex++;
            }

            // 프레임 업데이트 및 렌더링
            this.updateFrame(dt);

            // 종료 감지
            if (this.currentTime >= maxT) {
                this.currentTime = maxT;
                this.currentIndex = traj.length - 1;
                this.isPlaying = false;
                this.animFrameId = null;
                if (this.onFinishCallback) {
                    this.onFinishCallback(this.fullSim);
                }
                return;
            }
        }

        this.animFrameId = requestAnimationFrame(this.loop);
    }

    updateFrame(dt) {
        if (!this.fullSim || !this.fullSim.trajectory.length) return;
        const currentPt = this.fullSim.trajectory[this.currentIndex];

        // 렌더러 파티클 및 화면 갱신
        if (this.renderer) {
            if (dt > 0) {
                this.renderer.spawnThrustParticles(currentPt, dt);
                this.renderer.updateParticles(dt);
            }
            this.renderer.render(currentPt, this.fullSim, this.currentIndex);
        }

        // 차트 현재 시간 지시선 업데이트
        if (this.energyChart) {
            this.energyChart.setCurrentTime(this.currentTime);
        }
        if (this.kineticsChart) {
            this.kineticsChart.setCurrentTime(this.currentTime);
        }

        // UI 콜백 (실시간 대시보드 수치)
        if (this.onUpdateCallback) {
            this.onUpdateCallback(currentPt, this.currentTime, this.fullSim);
        }
    }
}

// 전역 등록
if (typeof window !== 'undefined') {
    window.RocketSimulator = RocketSimulator;
}
