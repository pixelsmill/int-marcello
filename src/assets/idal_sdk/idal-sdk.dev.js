/**
 * The IDAL object contains the SDK functions
 */
var IDAL = {
    /**
     * Use this method to get the control interface
     * @return a promise with the system interface
     */
    getControlInterfaces: (function() {
        var readyResolve = null;

        var promise = new Promise(function(resolve, reject) {
            // This promise will be resolved when receiving the ready event...
            readyResolve = resolve;
        });

        window.addEventListener("idal-system-ready", function(e) {
            if (readyResolve != null) {
                // Resolve the promise that was created in the first place
                readyResolve(e.detail);
                readyResolve = null;
            } else {
                // A new system ready has been received replacing the
                // previous value.
                // The next call to IDAL.getControlInterfaces() will return
                // a new promise resolved with this new interface.
                promise = Promise.resolve(e.detail);
            }
        });

        return function() {
            return promise;
        };
    })()
};

(function() {
    function getInvalidArgsPromise() {
        return Promise.reject({
            code: -20101,
            message: "invalid method parameters"
        });
    }

    function sendCustomEvent(type, detail) {
        var event = new CustomEvent(type, {
            detail: detail
        });
        window.setTimeout(function() {
            window.dispatchEvent(event);
        }, 0);
    }


    /**
     * Stubbed Logger control interface
     */
    function newLogger() {
        // Hiding stubbed implementation details using closure so that only public
        // members are visible...
        var MAX_LOG_IN_FILE = 200;
        var logfiles = {};

        return {
            log: function(id, message) {
                if ((typeof id === 'string') && (id.length > 0) && (message !== undefined)) {
                    // Create log file if not existing
                    var file = logfiles[id];
                    if (!file) {
                        logfiles[id] = file = [];
                    }
                    file.push(message);

                    // Avoid excessive log files
                    if (file.length > MAX_LOG_IN_FILE) {
                        file.shift();
                    }

                    return Promise.resolve(true);
                }
                return getInvalidArgsPromise();
            },

            delete: function(id) {
                if (typeof id === 'string') {
                    if (logfiles.hasOwnProperty(id)) {
                        delete logfiles[id];
                        return Promise.resolve(true);
                    }
                    return Promise.resolve(false);
                }
                return getInvalidArgsPromise();
            },

            list: function() {
                var list = [];
                for (var key in logfiles) {
                    list.push(key);
                }
                return Promise.resolve(list);
            },

            stat: function(id) {
                if (typeof id === 'string') {
                    if (logfiles.hasOwnProperty(id)) {
                        var size = 0;
                        var file = logfiles[id];
                        for (var i = 0; i < file.length; i++) {
                            size = size + file[i].length + 1;
                        }
                        return Promise.resolve({
                            size: size
                        });
                    }
                }
                return getInvalidArgsPromise();
            },

            read: function(id, offset, length) {
                if ((typeof id === 'string') &&
                    (typeof offset === 'number') &&
                    (offset >= 0) &&
                    (typeof length === 'number') &&
                    (length > 0)) {
                    if (logfiles.hasOwnProperty(id)) {
                        var data = "";
                        var curLength = 0;
                        var file = logfiles[id];
                        for (var i = 0; i < file.length; i++) {
                            data += file[i] + '\n';
                            curLength += file[i].length;
                        }
                        return Promise.resolve({
                            data: data,
                            length: curLength
                        });
                    }
                }
                return getInvalidArgsPromise();
            }
        }
    }

    /**
     * Stubbed Contact control interface
     */
    function Contact() {}

    Contact.prototype = {
        setOutputById: function(id, value) {
            if (typeof id === 'number') {
                if ((typeof value === 'number') || (typeof value === 'boolean')) {
                    return Promise.resolve(true);
                }
            }
            return getInvalidArgsPromise();
        },

        setOutputByMask: function(value, mask) {
            if ((typeof mask === 'number') && (typeof value === 'number')) {
                return Promise.resolve(true);
            }
            return getInvalidArgsPromise();
        },

        setInputConfiguration: function(config) {
            if (typeof config === 'object') {
                if (typeof config.controller == 'string') {
                    if (config.controller === 'browser') {
                        var error = false;
                        if (typeof config.keymaps !== 'undefined') {
                            error = ((typeof config.keymaps.combined !== 'undefined') && (!Array.isArray(config.keymaps.combined))) ||
                                ((typeof config.keymaps.standalone !== 'undefined') && (!Array.isArray(config.keymaps.standalone)))
                        }

                        if (config.lifetime) {
                            switch (config.lifetime) {
                                case 'url':
                                case 'session':
                                case 'site':
                                case 'scenario':
                                    break;

                                default:
                                    error = true;
                                    break;
                            }
                        }

                        if (!error) {
                            return Promise.resolve(true);
                        }

                    } else if (config.controller === 'videoplayer') {
                        return Promise.resolve(true);
                    }
                }

            }
            return getInvalidArgsPromise();
        },

        getInputByName: function(name) {
            if (name === 'combined') {
                return Promise.resolve({
                    name: name,
                    values: [false, false, false, false, false, false, false, false]
                });
            } else if (name === 'standalone') {
                return Promise.resolve({
                    name: name,
                    values: [false]
                });
            } else {
                return getInvalidArgsPromise();
            }
        }
    };

    /**
     * Stubbed Serial control interface
     */
    function Serial() {}

    Serial.prototype = {
        sendFrame: function(params) {
            if (params !== undefined) {
                if (params.hasOwnProperty('data')) {
                    return Promise.resolve(true);
                } else if (params.hasOwnProperty('id')) {
                    return Promise.resolve(true);
                }
            }
            return getInvalidArgsPromise();
        }
    };


    /**
     * Stubbed Printer control interface
     */
    function Printer() {
        this.jobCounter = 0;
    }

    Printer.prototype = {
        getState: function() {
            return Promise.resolve({
                connected: true,
                online: true,
                paper: 'ready',
                cover: 'closed'
            });
        },

        print: function(parameters) {
            if (parameters.url || parameters.data) {
                this.jobCounter++;

                sendPrinterJobStateEvent(this.jobCounter, 'queued', undefined);
                sendPrinterJobStateEvent(this.jobCounter, 'fetching', undefined);
                sendPrinterJobStateEvent(this.jobCounter, 'printing', undefined);
                sendPrinterJobStateEvent(this.jobCounter, 'printed', undefined);
                sendPrinterJobStateEvent(this.jobCounter, 'finished', undefined);

                return Promise.resolve(this.jobCounter);
            }
            return getInvalidArgsPromise();
        },

        cancelJob: function(job) {
            if (typeof job === 'number') {
                return Promise.resolve(true);
            }
            return getInvalidArgsPromise();
        },

        cancelAllJobs: function() {
            return Promise.resolve(true);
        },

        getJobState: function(job) {
            if (typeof job === 'number') {
                return Promise.resolve(null);
            }
            return getInvalidArgsPromise();
        },

        getAllJobStates: function() {
            return Promise.resolve([]);
        }
    }

    function sendPrinterJobStateEvent(id, state, message) {
        sendCustomEvent('idal-printer-event', {
            type: 'job-state',
            job: {
                id: id,
                state: state,
                message: message
            }
        });
    }
    /**
     * Stubbed Player control interface
     */
    function newPlayer() {
        var STATE_PLAYING = 'playing';
        var STATE_STOPPED = 'stopped';
        var STATE_PAUSED = 'paused';

        // Hiding stubbed implementation details using closure so that only public
        // members are visible...
        var thiz = {
            state: STATE_PLAYING,
            filename: 'fake video.mp4',
            folders: [{
                    name: "000 [LOOP] Fake folder",
                    number: 0
                },
                {
                    name: "001 [LOOP] Fake folder",
                    number: 1
                },
                {
                    name: "999 [LOOP] Fake folder",
                    number: 999
                },
            ],
            currentFolderIndex: 0,
            initialTime: new Date().getTime(),
            pausedTime: 0,
            duration: 120,
            volume: 100,
            mute: false
        };

        function sendPlayerEvent(detail) {
            return sendCustomEvent('idal-player-event', detail);
        }

        function setMute(mute) {
            if (thiz.mute != mute) {
                thiz.mute = mute;
                sendPlayerEvent({
                    type: 'mute-change',
                    mute: mute
                });
            }
        }

        function getFolderIndex(number) {
            for (var i = 0; i < thiz.folders.length; i++) {
                if (thiz.folders[i].number == number) {
                    return i;
                }
            }
            return -1;
        }

        function getPosition() {
            if (thiz.state == STATE_PAUSED) {
                return (thiz.pausedTime - thiz.initialTime) / 1000;
            } else if (thiz.state == STATE_PLAYING) {
                return ((new Date().getTime() - thiz.initialTime) / 1000) % thiz.duration;
            } else {
                return 0;
            }
        }

        function changeFolderIndex(idx) {
            sendPlayerEvent({
                type: 'folder-leave',
                folder: thiz.folders[thiz.currentFolderIndex]
            });
            thiz.currentFolderIndex = idx;

            sendPlayerEvent({
                type: 'folder-enter',
                folder: thiz.folders[idx]
            });

            thiz.initialTime = new Date().getTime();
        }

        function setState(state) {
            if (state != thiz.state) {
                if (state == STATE_PAUSED) {
                    thiz.pausedTime = new Date().getTime();
                }

                if (state == STATE_PLAYING) {
                    if (thiz.state == STATE_PAUSED) {
                        thiz.initialTime = new Date().getTime() - (thiz.pausedTime - thiz.initialTime);
                    } else if (thiz.state == STATE_STOPPED) {
                        thiz.initialTime = new Date().getTime();
                    }
                }

                thiz.state = state;
            }
        }

        return {
            playPause: function() {
                if (thiz.state == STATE_PLAYING) {
                    setState(STATE_PAUSED);
                } else {
                    setState(STATE_PLAYING);
                }

                return Promise.resolve(true);
            },

            play: function() {
                setState(STATE_PLAYING);
                return Promise.resolve(true);
            },

            stop: function() {
                setState(STATE_STOPPED);
                return Promise.resolve(true);
            },

            pause: function() {
                if (thiz.state == STATE_PLAYING) {
                    setState(STATE_PAUSED);
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            },

            togglePause: function() {
                if (thiz.state == STATE_PAUSED) {
                    setState(STATE_PLAYING);
                    return Promise.resolve(true);
                } else if (thiz.state == STATE_PLAYING) {
                    setState(STATE_PAUSED);
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            },

            resume: function() {
                if (thiz.state == STATE_PAUSED) {
                    setState(STATE_PLAYING);
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            },

            nextFolder: function() {
                if (thiz.currentFolderIndex < thiz.folders.length - 1) {
                    setState(STATE_PLAYING);
                    changeFolderIndex(thiz.currentFolderIndex + 1);
                    return Promise.resolve(true);
                }

                return Promise.resolve(false);
            },

            previousFolder: function() {
                if (thiz.currentFolderIndex > 0) {
                    setState(STATE_PLAYING);
                    changeFolderIndex(thiz.currentFolderIndex - 1);
                    return Promise.resolve(true);
                }
                return Promise.resolve(false);
            },

            nextFile: function() {
                thiz.pausedTime = thiz.initialTime = new Date().getTime();
                setState(STATE_PLAYING);
                return Promise.resolve(true);
            },

            previousFile: function() {
                thiz.pausedTime = thiz.initialTime = new Date().getTime();
                setState(STATE_PLAYING);
                return Promise.resolve(true);
            },

            playFolder: function(folder) {
                if (typeof folder == 'number') {
                    var idx = getFolderIndex(folder);
                    if (idx == -1) {
                        return Promise.resolve(false);
                    } else {
                        setState(STATE_PLAYING);
                        changeFolderIndex(idx);
                        return Promise.resolve(true);
                    }
                }
                return getInvalidArgsPromise();
            },

            setVolume: function(volume, relative) {
                if (typeof volume === 'number') {
                    if (relative) {
                        thiz.volume += volume;
                    } else {
                        thiz.volume = volume;
                    }
                    if (thiz.volume > 100) thiz.volume = 100;
                    else if (thiz.volume < 0) thiz.volume = 0;

                    sendPlayerEvent({
                        type: 'volume-change',
                        volume: thiz.volume
                    });

                    return Promise.resolve(true);
                }

                return getInvalidArgsPromise();
            },

            mute: function() {
                setMute(true);
                return Promise.resolve(true);
            },

            unmute: function() {
                setMute(false);
                return Promise.resolve(true);
            },

            toggleMute: function() {
                setMute(!thiz.mute);
                return Promise.resolve(true);
            },

            seek: function(position, relative) {
                if (typeof position == 'number') {
                    var currentPosition = getPosition();
                    if (relative) {
                        currentPosition += position;
                        if (currentPosition > thiz.duration) {
                            currentPosition = thiz.duration;
                        } else if (currentPosition < 0) {
                            currentPosition = 0;
                        }
                    } else {
                        if ((position >= 0) && (position <= thiz.duration)) {
                            currentPosition = position;
                        } else {
                            return Promise.resolve(false);
                        }
                    }

                    thiz.initialTime = new Date().getTime() - currentPosition * 1000;
                    return Promise.resolve(true);
                }
                return getInvalidArgsPromise();
            },

            getState: function() {
                return Promise.resolve(thiz.state);
            },

            getFileName: function() {
                return Promise.resolve(thiz.filename);
            },

            getFolderName: function() {
                return Promise.resolve(thiz.folders[thiz.currentFolderIndex].name);
            },

            getStorageDevice: function() {
                return Promise.resolve("Fake storage device");
            },

            getFolderNumber: function() {
                return Promise.resolve(thiz.folders[thiz.currentFolderIndex].number);
            },

            getAllFolders: function() {
                return Promise.resolve(thiz.folders);
            },

            getPosition: function() {
                return Promise.resolve(getPosition());
            },

            getRemainingTime: function() {
                if (thiz.state == STATE_STOPPED) {
                    return Promise.resolve(0);
                } else {
                    return Promise.resolve(thiz.duration - getPosition());
                }
            },

            getDuration: function() {
                if (thiz.state != STATE_STOPPED) {
                    return Promise.resolve(thiz.duration);
                } else {
                    return Promise.resolve(0);
                }
            },

            getVolume: function() {
                return Promise.resolve(thiz.volume);
            },

            getMute: function() {
                return Promise.resolve(thiz.mute);
            }
        }
    };

    function Browser() {}
    Browser.prototype = {
        setDesktopMode: function(enabled) {
            if (typeof enabled === 'boolean') {
                return Promise.resolve(true);
            }
            return getInvalidArgsPromise();
        }
    };

    if (navigator.userAgent.search("WSPlayer") == -1) {
        window.addEventListener("load", function() {
            console.warn("Using IDAL SDK stubbed implementation!");

            // Send event to signal the player is ready to be used
            // This is only used to provide stubbed implementation (ie: when not running on video player)
            var event = new CustomEvent('idal-system-ready', {
                detail: {
                    printer: new Printer(),
                    player: newPlayer(),
                    browser: new Browser(),
                    logger: newLogger(),
                    contact: new Contact(),
                    serial: new Serial()
                }
            });
            window.setTimeout(function() {
                window.dispatchEvent(event);
            }, 0);
        });
    }
})();