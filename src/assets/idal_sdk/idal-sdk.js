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