class Conversion {
    constructor() {
        this.metadata = null;
        this.photoData = null;
        this.cameras = [];
        this.selectedCamera = null;
        this.selectedLens = null;
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
     * Select a lens for the current camera
     * @param {number} index - Lens index in the camera's lenses array
     */
    selectLens(index) {
        if (this.selectedCamera && this.selectedCamera.lenses && 
            index >= 0 && index < this.selectedCamera.lenses.length) {
            this.selectedLens = this.selectedCamera.lenses[index];
            return this.selectedLens;
        }
        this.selectedLens = null;
        return null;
    }

    /**
     * Process an uploaded photo file
     * @param {File} file - The uploaded image file
     * @returns {string} - Object URL for the image
     */
    processUploadedFile(file) {
        this.photoData = file;
        return URL.createObjectURL(file);
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
                                width: 0,  // Or any default value
                                height: 0  // Or any default value
                            },
                            camera: {
                                exposureTime: null,
                                fNumber: null,
                                iso: null
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
        console.log('Processing EXIF data:', exifData);
        console.log('Available tags:', Object.keys(exifData));
        
        let fNumber = null;
        if (exifData.FNumber) {
            console.log('FNumber data:', exifData.FNumber);
            if (Array.isArray(exifData.FNumber.value) && exifData.FNumber.value.length === 2) {
                fNumber = exifData.FNumber.value[0] / exifData.FNumber.value[1];
            } else {
                fNumber = exifData.FNumber.description || exifData.FNumber.value;
            }
        } else if (exifData.ApertureValue) {
            // Try alternative tag
            console.log('Using ApertureValue instead:', exifData.ApertureValue);
            if (Array.isArray(exifData.ApertureValue.value) && exifData.ApertureValue.value.length === 2) {
                // ApertureValue is usually in APEX units, convert to f-number
                const apex = exifData.ApertureValue.value[0] / exifData.ApertureValue.value[1];
                fNumber = Math.pow(2, apex/2).toFixed(1);
            } else {
                fNumber = exifData.ApertureValue.description;
            }
        }

        // Extract and format the exposure time
        let exposureTime = null;
        if (exifData.ExposureTime) {
            console.log('ExposureTime data:', exifData.ExposureTime);
            if (typeof exifData.ExposureTime.description === 'string') {
                exposureTime = exifData.ExposureTime.description;
            } else if (Array.isArray(exifData.ExposureTime.value) && exifData.ExposureTime.value.length === 2) {
                const [numerator, denominator] = exifData.ExposureTime.value;
                exposureTime = `${numerator}/${denominator}`;
            }
        } else if (exifData.ShutterSpeedValue) {
            // Try alternative tag
            console.log('Using ShutterSpeedValue instead:', exifData.ShutterSpeedValue);
            if (Array.isArray(exifData.ShutterSpeedValue.value)) {
                const apex = exifData.ShutterSpeedValue.value[0] / exifData.ShutterSpeedValue.value[1];
                const denominator = Math.pow(2, apex);
                exposureTime = `1/${Math.round(denominator)}`;
            } else {
                exposureTime = exifData.ShutterSpeedValue.description;
            }
        }

        // Extract ISO
        let iso = null;
        if (exifData.ISOSpeedRatings) {
            console.log('ISO data:', exifData.ISOSpeedRatings);
            iso = exifData.ISOSpeedRatings.value;
        } else if (exifData.PhotographicSensitivity) {
            // Try alternative tag
            console.log('Using PhotographicSensitivity instead:', exifData.PhotographicSensitivity);
            iso = exifData.PhotographicSensitivity.value;
        }

         return {
            device: {
                make: this.getExifValue(exifData, 'Make'),
                model: this.getExifValue(exifData, 'Model'),
                software: this.getExifValue(exifData, 'Software')
            },
            image: {
                width: this.getExifValue(exifData, 'ImageWidth') || 
                       this.getExifValue(exifData, 'ExifImageWidth'),
                height: this.getExifValue(exifData, 'ImageHeight') || 
                        this.getExifValue(exifData, 'ExifImageHeight'),
                orientation: this.getExifValue(exifData, 'Orientation'),
                created: this.getExifValue(exifData, 'DateTimeOriginal') || new Date().toISOString()
            },
            camera: {
                exposureTime: exposureTime,
                fNumber: fNumber,
                iso: iso
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