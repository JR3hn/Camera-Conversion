class Conversion {
    constructor() {
        this.metadata = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.stream = null;
        this.photoData = null;
        this.cameras = [];
        this.selectedCamera = null;
    }
    
    /**
     * Initialize camera and UI elements
     * @param {HTMLVideoElement} videoElement - Video element for camera preview
     * @param {HTMLCanvasElement} canvasElement - Canvas for capturing photos
     */
    initCamera(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
    }

    /**
     * Load camera data from JSON file
     * @returns {Promise} - Resolves when cameras are loaded
     */
    async loadCameras() {
        try {
            const response = await fetch('CameraRegister.json');
            if (!response.ok) {
                throw new Error(`Failed to load camera data: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            this.cameras = data.cameras || [];
            
            if (this.cameras.length > 0) {
                this.selectedCamera = this.cameras[0]; // Select first camera by default
            }
            
            return this.cameras;
        } catch (error) {
            console.error('Error loading cameras:', error);
            throw error;
        }
    }

    /**
     * Select a camera by its index in the cameras array
     * @param {number} index - Camera index
     */
    selectCamera(index) {
        if (index >= 0 && index < this.cameras.length) {
            this.selectedCamera = this.cameras[index];
            return this.selectedCamera;
        }
        return null;
    }

    /**
     * Start the camera stream
     * @returns {Promise} - Resolves when camera is ready
     */
    async startCamera() {
        try {
            // Request camera access with preferred settings for mobile
            const constraints = {
                video: {
                    facingMode: 'environment', // Use back camera on mobile devices
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            
            return new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    resolve();
                };
            });
        } catch (error) {
            console.error('Error starting camera:', error);
            throw error;
        }
    }

    /**
     * Stop the camera stream
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.videoElement.srcObject = null;
        }
    }
    
    /**
     * Capture photo from current video frame
     * @returns {Promise<Blob>} - Promise resolving with image blob
     */
    capturePhoto() {
        const context = this.canvasElement.getContext('2d');
        
        // Set canvas dimensions to match video
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
        
        // Draw the current video frame to the canvas
        context.drawImage(this.videoElement, 0, 0);
        
        // Convert canvas content to blob
        return new Promise((resolve) => {
            this.canvasElement.toBlob(blob => {
                this.photoData = blob;
                resolve(blob);
            }, 'image/jpeg', 0.95);
        });
    }
    
    /**
     * Extract metadata from the captured photo
     * @returns {Promise} - Promise resolving with the extracted metadata
     */
    async extractMetadata() {
        if (!this.photoData) {
            throw new Error('No photo captured yet');
        }
        
        try {
            // Use EXIF.js library to extract metadata
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                
                reader.onload = (event) => {
                    const arrayBuffer = event.target.result;
                    try {
                        // Use the ExifReader library to parse metadata
                        const tags = ExifReader.load(arrayBuffer);
                        this.metadata = this.processExifData(tags);
                        resolve(this.metadata);
                    } catch (error) {
                        // If ExifReader fails, create basic metadata
                        this.metadata = {
                            device: {
                                userAgent: navigator.userAgent
                            },
                            image: {
                                timestamp: new Date().toISOString(),
                                width: this.canvasElement.width,
                                height: this.canvasElement.height
                            }
                        };
                        resolve(this.metadata);
                    }
                };
                
                reader.onerror = () => reject('Error reading image data');
                reader.readAsArrayBuffer(this.photoData);
            });
        } catch (error) {
            console.error('Metadata extraction error:', error);
            throw error;
        }
    }
    
    /**
     * Process EXIF data into a structured format
     * @param {Object} exifData - Raw EXIF data
     * @returns {Object} - Structured metadata
     */
    processExifData(exifData) {
        return {
            device: {
                make: this.getExifValue(exifData, 'Make'),
                model: this.getExifValue(exifData, 'Model'),
                software: this.getExifValue(exifData, 'Software')
            },
            image: {
                width: this.getExifValue(exifData, 'ImageWidth') || this.canvasElement.width,
                height: this.getExifValue(exifData, 'ImageHeight') || this.canvasElement.height,
                orientation: this.getExifValue(exifData, 'Orientation'),
                created: this.getExifValue(exifData, 'DateTimeOriginal') || new Date().toISOString()
            },
            camera: {
                exposureTime: this.getExifValue(exifData, 'ExposureTime'),
                fNumber: this.getExifValue(exifData, 'FNumber'),
                iso: this.getExifValue(exifData, 'ISOSpeedRatings')
            }
        };
    }
    
    /**
     * Safely get EXIF value 
     * @param {Object} exifData - EXIF data object
     * @param {String} tag - Tag name
     * @returns {any} - Tag value or null
     */
    getExifValue(exifData, tag) {
        if (exifData[tag] && exifData[tag].value) {
            return exifData[tag].value;
        }
        return null;
    }
    
    /**
     * Helper function to convert exposure time string to seconds
     * @param {string|number} exposureTime - Exposure time string (e.g. "1/250") or number
     * @returns {number} - Time in seconds
     */
    convertExposureTime(exposureTime) {
        if (typeof exposureTime === 'number') {
            return exposureTime;
        }
        
        if (typeof exposureTime === 'string') {
            if (exposureTime.includes('/')) {
                const [numerator, denominator] = exposureTime.split('/').map(parseFloat);
                return numerator / denominator;
            } else {
                return parseFloat(exposureTime);
            }
        }
        
        return 0;
    }

    /**
     * Convert exposure settings
     * @param {*} fNumber1 - Source aperture
     * @param {*} fNumber2 - Target aperture
     * @param {*} exposureTime1 - Source exposure time
     * @param {*} exposureTime2 - Target exposure time
     * @param {*} iso1 - Source ISO
     * @param {*} iso2 - Target ISO
     * @returns {number} - Conversion factor
     */
    convert(fNumber1, fNumber2, exposureTime1, exposureTime2, iso1, iso2) {
        // Convert f-number to decimal
        const fNumberDecimal1 = parseFloat(fNumber1);
        const fNumberDecimal2 = parseFloat(fNumber2);
        
        // Convert exposure time to seconds
        const exposureTimeSeconds1 = this.convertExposureTime(exposureTime1);
        const exposureTimeSeconds2 = this.convertExposureTime(exposureTime2);
        
        // Convert ISO to integer
        const isoValue1 = parseInt(iso1, 10);
        const isoValue2 = parseInt(iso2, 10);
        
        // Calculate conversion factor
        const conversionFactor = (Math.pow(fNumberDecimal1, 2) / Math.pow(fNumberDecimal2, 2)) * 
                               (exposureTimeSeconds1 / exposureTimeSeconds2) * 
                               (isoValue1 / isoValue2);
        
        return conversionFactor;
    }

    /**
     * Convert settings using extracted metadata as source
     * @param {number|string} targetFNumber - Target f-number
     * @param {number|string} targetExposureTime - Target exposure time
     * @param {number} targetIso - Target ISO
     * @returns {Object} - Conversion result with factor and recommended settings
     */
    convertFromMetadata(targetFNumber, targetExposureTime, targetIso) {
        if (!this.metadata || !this.metadata.camera) {
            throw new Error('No metadata available. Please capture a photo and extract metadata first.');
        }
        
        // Extract values from metadata
        const sourceFNumber = this.metadata.camera.fNumber;
        const sourceExposureTime = this.metadata.camera.exposureTime;
        const sourceIso = this.metadata.camera.iso;
        
        if (!sourceFNumber || !sourceExposureTime || !sourceIso) {
            throw new Error('Incomplete camera metadata. Missing f-number, exposure time, or ISO.');
        }
        
        // Perform conversion
        const factor = this.convert(
            sourceFNumber, 
            targetFNumber, 
            sourceExposureTime, 
            targetExposureTime, 
            sourceIso, 
            targetIso
        );
        
        // Calculate stops (log₂ of the factor)
        // Positive stops mean more light, negative means less light
        const stops = Math.log(factor) / Math.log(2);
        
        return {
            factor,
            stops: stops.toFixed(2), // Round to 2 decimal places
            original: {
                fNumber: sourceFNumber,
                exposureTime: sourceExposureTime,
                iso: sourceIso
            },
            target: {
                fNumber: targetFNumber,
                exposureTime: targetExposureTime,
                iso: targetIso
            }
        };
    }
}