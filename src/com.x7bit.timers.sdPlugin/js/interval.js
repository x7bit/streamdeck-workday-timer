/// <reference path="../libs/js/stream-deck.js" />
/// <reference path="helper.js" />

class IntervalTimer {

	constructor(context, settings) {
		this.context = context;
		this.round = getIntegerSetting(settings, 'round', 1);
		this.hours = getIntegerSetting(settings, 'hours', 1);
		this.minutes = getIntegerSetting(settings, 'minutes');
		this.seconds = getIntegerSetting(settings, 'seconds');
		this.goalSec = this.hours * 3600 + this.minutes * 60 + this.seconds;
		this.isRenderFrozen = false;
		this.intervalId = null;
		this.canvasTimer = new CanvasIntervalTimer(context);
		this.alarmAudio = document.getElementById('audio-alarm');
		this.alarmTimeoutId = null;

		const timerStartMs = getIntegerSetting(settings, 'timerStartMs', null);
		const pauseStartMs = getIntegerSetting(settings, 'pauseStartMs', null);
		const isRunning = getBooleanSetting(settings, 'isRunning');

		if (timerStartMs !== null) {
			this.timerStartMs = timerStartMs;
			this.pauseStartMs = pauseStartMs;
			this.isRunning = isRunning;
			this.drawTimer();
			if (isRunning) {
				this.addInterval();
			}
		} else {
			this.timerStartMs = null;
			this.pauseStartMs = null;
			this.isRunning = false;
		}
	}

	loadState(settings) {
		const hours = getIntegerSetting(settings, 'hours');
		const minutes = getIntegerSetting(settings, 'minutes');
		const seconds = getIntegerSetting(settings, 'seconds');
		const goalSec = hours * 3600 + minutes * 60 + seconds;
		if (this.goalSec !== goalSec) {
			this.hours = hours;
			this.minutes = minutes;
			this.seconds = seconds;
			this.goalSec = goalSec;
			this.drawTimer();
		}
	}

	saveState() {
		const payload = {
			round: this.round,
			hours: this.hours.toString(),
			minutes: this.minutes.toString(),
			seconds: this.seconds.toString(),
			timerStartMs: this.timerStartMs,
			pauseStartMs: this.pauseStartMs,
			isRunning: this.isRunning,
		};
		$SD.setSettings(this.context, payload);
	}

	shortPress(nowMs) {
		if (this.alarmTimeoutId) {
			this.alarmStop();
		} else {
			if (this.isRunning) {
				this.pause(nowMs);
			} else {
				this.start(nowMs);
			}
		}
	}

	longPress(nowMs) {
		this.reset();
	}

	isStarted() {
		return !!this.timerStartMs;
	}

	getElapsedSec(nowMs = null) {
		const startMs = (
			this.isRunning ?
			nowMs ?? Date.now() :
			this.pauseStartMs ?? this.timerStartMs
		);
		return Math.round((startMs - this.timerStartMs) / 1000);
	}

	start(nowMs) {
		if (!this.isRunning) {
			if (this.goalSec > 0) {
				if (this.isStarted()) {
					const pauseElapsedMs = nowMs - this.pauseStartMs;
					this.timerStartMs += pauseElapsedMs;
				} else {
					this.timerStartMs = nowMs;
				}
				this.pauseStartMs = null;
				this.isRunning = true;
				this.drawTimer(nowMs);
				this.addInterval();
				this.saveState();
			} else {
				$SD.showAlert(this.context);
			}
		}
	}

	pause(nowMs) {
		if (this.isRunning) {
			this.pauseStartMs = nowMs;
			this.isRunning = false;
			this.drawTimer(nowMs);
			this.remInterval();
			this.saveState();
		}
	}

	reset() {
		this.round = 1;
		this.timerStartMs = null;
		this.pauseStartMs = null;
		this.isRunning = false;
		this.isRenderFrozen = false;
		this.remInterval();
		$SD.setImage(this.context);
		this.saveState();
	}

	addInterval() {
		if (this.isRunning) {
			if (!this.intervalId) {
				this.intervalId = setInterval(() => this.drawTimer(), 1000);
			}
		}
	}

	remInterval() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	drawTimer(nowMs = null) {
		if (this.isStarted()) {
			const elapsedSec = this.getElapsedSec(nowMs);
			if (elapsedSec < this.goalSec) {
				if (!this.isRenderFrozen) {
					this.canvasTimer.drawTimer(elapsedSec, this.goalSec, this.round, this.isRunning);
				}
			} else {
				this.round++;
				this.timerStartMs = nowMs ?? Date.now();
				this.pauseStartMs = null;
				this.canvasTimer.drawTimer(0, this.goalSec, this.round, this.isRunning);
				this.alarmPlay();
			}
		} else {
			$SD.setImage(this.context);
		}
	}

	drawClearImage() {
		this.canvasTimer.drawClearImage();
	}

	alarmPlay() {
		this.alarmAudio.play();
		this.alarmTimeoutId = setTimeout(() => {
			this.alarmTimeoutId = null;
		}, 5906);
	}

	alarmStop() {
		this.alarmAudio.pause();
		this.alarmAudio.currentTime = 0;
		this.alarmTimeoutId = null;
	}
};

class CanvasIntervalTimer {

	constructor(context) {
		this.context = context;
		this.canvas = document.createElement('canvas');
		this.canvas.width = 144;
		this.canvas.height = 144;
		this.ctx = this.canvas.getContext('2d');
	}

	drawTimer(elapsedSec, goalSec, round, isRunning) {
		//Background
		const img = document.getElementById(isRunning ? 'timer-bg-running' : 'timer-bg-pause');
		this.ctx.drawImage(img, 0, 0, 144, 144);
		//Foreground Text (remaining)
		const remainingText = this.getRemainingText(elapsedSec, goalSec);
		const fSizeRem = this.getRemainingFontSize(remainingText.length);
		const fSizeRemThird = fSizeRem / 3;
		const posYRem = ((144 + fSizeRemThird) / 2) + 4;
		this.ctx.fillStyle = isRunning ? '#5881e0' : '#606060';
		this.ctx.font = `${fSizeRem}px arial`;
		this.ctx.textBaseline = 'middle';
		this.ctx.textAlign = 'center';
		this.ctx.fillText(remainingText, 72, posYRem);
		//Foreground Text (round)
		const roundText = `Round ${round}`;
		const fSizeRnd = this.getRoundFontSize(round);
		const fSizeRndThird = fSizeRnd / 3;
		this.ctx.fillStyle = isRunning ? '#5881e0' : '#606060';
		this.ctx.font = `${fSizeRnd}px arial`;
		this.ctx.textBaseline = 'middle';
		this.ctx.textAlign = 'center';
		this.ctx.fillText(roundText, 72, posYRem - fSizeRem + fSizeRndThird);
		//Foreground Circles
		if (isRunning) {
			for (let i = 0; i < 3 && i <= elapsedSec; i++) {
				const circleOffset = (Math.abs(((elapsedSec + 3 - i) % 4) - 2) - 1) * 14;
				this.ctx.beginPath();
				this.ctx.arc(72 + circleOffset, 100 + fSizeRemThird, 6, 0, 2 * Math.PI, false);
				this.ctx.fillStyle = this.getCircleColor(i);
				this.ctx.fill();
				if (i == 1 && circleOffset !== 0) {
					break;
				}
			}
		}
		//Draw Canvas
		$SD.setImage(this.context, this.canvas.toDataURL('image/png'));
	}

	drawClearImage() {
		this.ctx.fillStyle = '#000';
		this.ctx.fillRect(0, 0, 144, 144);
		$SD.setImage(this.context, this.canvas.toDataURL('image/png'));
	}

	getRemainingText(elapsedSec, goalSec) {
		const totalSec = goalSec - elapsedSec;
		const hours = Math.floor(totalSec / 3600);
		const mins = Math.floor((totalSec % 3600) / 60);
		const secs = totalSec % 60;
		return (
			goalSec < 3600 ?
			`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}` :
			`${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
		);
	}

	getRemainingFontSize(len) {
		if (len <= 5) {
			return 38;
		}
		return len > 7 ? 32 - len / 2 : 32;
	}

	getRoundFontSize(round) {
		if (round <= 9) {
			return 23;
		}
		return 21;
	}

	getCircleColor(index) {
		switch (index) {
			case 0:
				return '#3d6ee0';
			case 1:
				return '#162a52';
			default:
				return '#0f1d35';
		}
	}
};