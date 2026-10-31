/**
 * Water Rocket Simulation Controller & Time Loop
 * - 애니메이션이 끝날 때까지 결과를 예측할 수 없도록 진행 상태(isStarted, isFinished) 동기화
 */

class RocketSimulator {
    constructor() {
        this.fullSim = null;
        this.isPlaying = false;
        this.isStarted = false;
        this.isFinished = false;
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

    loadSimulation(params, keepFinishedState = false) {
        this.fullSim = RocketPhysics.simulate(params);
        this.currentTime = 0;
        this.currentIndex = 0;
        this.isPlaying = false;
        if (!keepFinishedState) {
            this.isStarted = false;
            this.isFinished = false;
        }

        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        if (this.energyChart) {
            this.energyChart.setData(this.fullSim.trajectory, this.isStarted, this.isFinished);
        }
        if (this.kineticsChart) {
            this.kineticsChart.setData(this.fullSim.trajectory, this.isStarted, this.isFinished);
        }

        if (this.renderer) {
            this.renderer.particles = [];
            this.renderer.setFlightState(this.isStarted, this.isFinished);
            if (!keepFinishedState) {
                this.renderer.camera.x = 0;
                this.renderer.camera.y = 0;
                this.renderer.camera.scale = 10.5;
                this.renderer.camera.mode = 'auto';
            }
        }

        this.updateFrame(0);
        return this.fullSim;
    }

    start() {
        if (!this.fullSim) return;
        this.isPlaying = true;
        this.isStarted = true;
        this.isFinished = false;
        this.lastTimestamp = performance.now();

        if (this.renderer) {
            this.renderer.setFlightState(true, false);
        }
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
            if (this.fullSim && this.currentTime >= this.fullSim.metrics.flightTime) {
                this.currentTime = 0;
                this.currentIndex = 0;
            }
            this.start();
        }
    }

    reset() {
        this.pause();
        this.currentTime = 0;
        this.currentIndex = 0;
        this.isStarted = false;
        if (this.renderer) {
            this.renderer.particles = [];
            this.renderer.setFlightState(false, this.isFinished);
        }
        this.updateFrame(0);
    }

    setSpeed(speed) {
        this.playbackSpeed = Math.max(0.1, Math.min(10.0, speed));
    }

    loop(timestamp) {
        if (!this.isPlaying) {
            this.animFrameId = null;
            return;
        }

        if (!this.lastTimestamp) this.lastTimestamp = timestamp;
        const deltaMs = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        const dt = (deltaMs / 1000) * this.playbackSpeed;

        if (this.fullSim && this.fullSim.trajectory.length > 0) {
            this.currentTime += dt;
            const traj = this.fullSim.trajectory;
            const maxT = this.fullSim.metrics.flightTime;

            while (this.currentIndex < traj.length - 1 && traj[this.currentIndex].t < this.currentTime) {
                this.currentIndex++;
            }

            if (this.currentTime >= maxT) {
                this.currentTime = maxT;
                this.currentIndex = traj.length - 1;
                this.isPlaying = false;
                this.isFinished = true;
                this.animFrameId = null;

                if (this.renderer) {
                    this.renderer.setFlightState(true, true);
                }
                this.updateFrame(dt);

                if (this.onFinishCallback) {
                    this.onFinishCallback(this.fullSim);
                }
                return;
            }

            this.updateFrame(dt);
        }

        this.animFrameId = requestAnimationFrame(this.loop);
    }

    updateFrame(dt) {
        if (!this.fullSim || !this.fullSim.trajectory.length) return;
        const currentPt = this.fullSim.trajectory[this.currentIndex];

        if (this.renderer) {
            if (dt > 0 && this.isPlaying) {
                this.renderer.spawnThrustParticles(currentPt, dt);
                this.renderer.updateParticles(dt);
            }
            this.renderer.render(currentPt, this.fullSim, this.currentIndex);
        }

        if (this.energyChart) {
            this.energyChart.setProgress(this.currentTime, this.isStarted, this.isFinished);
        }
        if (this.kineticsChart) {
            this.kineticsChart.setProgress(this.currentTime, this.isStarted, this.isFinished);
        }

        if (this.onUpdateCallback) {
            this.onUpdateCallback(currentPt, this.currentTime, this.fullSim);
        }
    }
}

if (typeof window !== 'undefined') {
    window.RocketSimulator = RocketSimulator;
}
