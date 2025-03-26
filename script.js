// Configuration
const CONFIG = {
    ENDPOINTS: {
        NOMINATIM: 'https://nominatim.openstreetmap.org/search',
        CORS_PROXY: 'https://api.allorigins.win/raw?url=',
        WEATHER: 'https://api.open-meteo.com/v1/forecast'
    }
};

// DOM Elements
const DOM = {
    form: document.getElementById('addressForm'),
    addressInput: document.getElementById('addressInput'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    resultsContainer: document.getElementById('resultsContainer'),
    errorContainer: document.getElementById('errorContainer'),
    errorMessage: document.getElementById('errorMessage'),
    fullAddress: document.getElementById('fullAddress'),
    region: document.getElementById('region'),
    city: document.getElementById('city'),
    neighbourhood: document.getElementById('neighbourhood'),
    houseSize: document.getElementById('houseSize'),
    windowCount: document.getElementById('windowCount'),
    monthlyEnergy: document.getElementById('monthlyEnergy'),
    annualEnergy: document.getElementById('annualEnergy')
};

class HomeEnergyEstimator {
    constructor() {
        this.bindEvents();
    }

    bindEvents() {
        DOM.form.addEventListener('submit', this.handleSubmit.bind(this));
    }

    async handleSubmit(event) {
        event.preventDefault();
        const address = DOM.addressInput.value.trim();

        if (!address) {
            this.handleError('Please enter an address or postal code');
            return;
        }

        this.resetUI();
        console.log('Searching for address:', address);

        try {
            // Step 1: Validate address
            const addressData = await this.validateAddress(address);
            console.log('Address data received:', addressData);

            // Step 2: Calculate house details based on address
            const houseDetails = this.calculateHouseDetails(addressData);
            console.log('House details calculated:', houseDetails);

            // Step 3: Get energy usage
            const energyUsage = await this.getEnergyUsage(addressData.latitude, addressData.longitude);
            console.log('Energy usage calculated:', energyUsage);

            // Step 4: Display results
            this.displayResults(addressData, houseDetails, energyUsage);

            DOM.loadingIndicator.classList.add('hidden');
            DOM.resultsContainer.classList.remove('hidden');
        } catch (error) {
            console.error('Error in handleSubmit:', error);
            this.handleError(error.message);
        }
    }

    resetUI() {
        DOM.loadingIndicator.classList.remove('hidden');
        DOM.resultsContainer.classList.add('hidden');
        DOM.errorContainer.classList.add('hidden');
    }

    handleError(message) {
        DOM.loadingIndicator.classList.add('hidden');
        DOM.errorContainer.classList.remove('hidden');
        if (DOM.errorMessage) {
            DOM.errorMessage.textContent = message;
        } else {
            console.error('Error message element not found:', message);
        }
    }

    async validateAddress(inputAddress) {
        try {
            // First try with postal code if it looks like one
            let searchQuery = inputAddress;
            if (/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(inputAddress)) {
                searchQuery = `${inputAddress}, Canada`;
            }

            // Use a more reliable search query format
            const formattedQuery = searchQuery.includes(',') ? searchQuery : `${searchQuery}, Canada`;
            
            const params = new URLSearchParams({
                q: formattedQuery,
                format: 'json',
                limit: 1,
                'accept-language': 'en',
                'addressdetails': 1,
                'countrycodes': 'ca'
            });

            const nominatimUrl = `${CONFIG.ENDPOINTS.NOMINATIM}?${params}`;
            const proxyUrl = `${CONFIG.ENDPOINTS.CORS_PROXY}${encodeURIComponent(nominatimUrl)}`;
            
            console.log('Fetching from Nominatim API:', proxyUrl);
            
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.error('Nominatim API error response:', response.status, response.statusText);
                throw new Error(`Nominatim API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Nominatim API response:', data);

            if (!data || data.length === 0) {
                throw new Error('Address not found. Please try a different address or postal code.');
            }

            const result = data[0];
            if (!result.lat || !result.lon) {
                throw new Error('Invalid coordinates received from the API.');
            }

            // Extract detailed address components
            const addressDetails = result.address || {};
            console.log('Parsed address components:', addressDetails);

            // Extract region (province)
            const region = addressDetails.state || addressDetails.province || addressDetails.county;
            if (!region) {
                console.warn('Region not found in address:', addressDetails);
            }

            // Extract city
            const city = addressDetails.city || addressDetails.town || addressDetails.village || addressDetails.suburb;
            if (!city) {
                console.warn('City not found in address:', addressDetails);
            }

            // Extract neighbourhood
            const neighbourhood = addressDetails.neighbourhood || addressDetails.suburb;
            if (!neighbourhood) {
                console.warn('Neighbourhood not found in address:', addressDetails);
            }

            // Validate that we have at least a city or region
            if (!city && !region) {
                throw new Error('Could not determine location. Please try a more specific address.');
            }

            return {
                label: result.display_name,
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon),
                country: 'Canada',
                region: region || 'Unknown',
                city: city || 'Unknown',
                neighbourhood: neighbourhood || 'Unknown',
                postcode: addressDetails.postcode || 'Unknown'
            };
        } catch (error) {
            console.error('Error in validateAddress:', error);
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Network error. Please check your internet connection and try again.');
            }
            if (error.message.includes('Could not determine location')) {
                throw error;
            }
            throw new Error(`Could not validate address: ${error.message}`);
        }
    }

    calculateHouseDetails(addressData) {
        // Base house size by region (in square feet)
        const baseSizeByRegion = {
            'Ontario': 2000,
            'British Columbia': 1800,
            'Quebec': 1600,
            'Alberta': 2200,
            'Manitoba': 1900,
            'Saskatchewan': 2100,
            'Nova Scotia': 1700,
            'New Brunswick': 1700,
            'Newfoundland and Labrador': 1600,
            'Prince Edward Island': 1600,
            'Yukon': 1800,
            'Northwest Territories': 1900,
            'Nunavut': 1800
        };

        // Get base size for the region
        const baseSize = baseSizeByRegion[addressData.region] || 1800;

        // Adjust size based on neighbourhood type
        let neighbourhoodFactor = 1;
        if (addressData.neighbourhood) {
            const lowerNeighbourhoods = ['downtown', 'core', 'central', 'old town', 'historic'];
            const upperNeighbourhoods = ['suburbs', 'estates', 'heights', 'hills', 'park'];
            
            const lowerMatch = lowerNeighbourhoods.some(term => 
                addressData.neighbourhood.toLowerCase().includes(term)
            );
            const upperMatch = upperNeighbourhoods.some(term => 
                addressData.neighbourhood.toLowerCase().includes(term)
            );

            if (lowerMatch) neighbourhoodFactor = 0.8;
            if (upperMatch) neighbourhoodFactor = 1.2;
        }

        // Adjust size based on city type
        let cityFactor = 1;
        if (addressData.city) {
            const majorCities = ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Edmonton', 'Ottawa'];
            const isMajorCity = majorCities.includes(addressData.city);
            cityFactor = isMajorCity ? 0.9 : 1.1; // Smaller houses in major cities
        }

        // Calculate final house size
        const houseSize = Math.round(baseSize * neighbourhoodFactor * cityFactor);

        // Calculate window count based on house size and location
        // More windows in warmer climates, fewer in colder climates
        const latitudeFactor = 1 - (Math.abs(addressData.latitude) / 90) * 0.3;
        const windowsPerSqFt = 0.01 * latitudeFactor; // Base rate of 1 window per 100 sq ft
        const windowCount = Math.round(houseSize * windowsPerSqFt);

        return {
            size: houseSize,
            windows: windowCount
        };
    }

    async getEnergyUsage(latitude, longitude) {
        try {
            // Get weather data for the location using OpenMeteo API
            const weatherUrl = `${CONFIG.ENDPOINTS.WEATHER}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`;
            const proxyUrl = `${CONFIG.ENDPOINTS.CORS_PROXY}${encodeURIComponent(weatherUrl)}`;

            console.log('Fetching weather data:', proxyUrl);

            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.error('Weather API error response:', response.status, response.statusText);
                throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Weather API response:', data);

            if (!data || !data.current) {
                throw new Error('Invalid weather data received');
            }

            // Get current weather conditions
            const temp = data.current.temperature_2m;
            const humidity = data.current.relative_humidity_2m;
            const windSpeed = data.current.wind_speed_10m;

            // Calculate energy usage based on weather conditions
            let baseUsage;
            if (temp < 0) {
                // Winter heating
                baseUsage = 1500 + (Math.abs(temp) * 100);
            } else if (temp > 25) {
                // Summer cooling
                baseUsage = 1000 + ((temp - 25) * 50);
            } else {
                // Moderate temperature
                baseUsage = 800;
            }

            // Adjust for humidity and wind speed
            const humidityFactor = 1 + (humidity / 100) * 0.2;
            const windFactor = 1 + (windSpeed / 10) * 0.1;
            const latitudeFactor = 1 + (Math.abs(latitude) / 90) * 0.3;

            // Calculate final monthly usage
            const monthlyUsage = Math.round(baseUsage * humidityFactor * windFactor * latitudeFactor);
            const annualUsage = monthlyUsage * 12;

            return {
                monthly: monthlyUsage,
                annual: annualUsage,
                temperature: temp,
                humidity: humidity,
                windSpeed: windSpeed
            };
        } catch (error) {
            console.error('Error fetching weather data:', error);
            if (error.message.includes('404')) {
                throw new Error('Weather data not available for this location.');
            }
            throw new Error('Unable to fetch energy usage data. Please try again later.');
        }
    }

    displayResults(addressData, houseDetails, energyUsage) {
        // Display address details
        DOM.fullAddress.textContent = addressData.label;
        DOM.region.textContent = addressData.region;
        DOM.city.textContent = addressData.city;
        DOM.neighbourhood.textContent = addressData.neighbourhood;

        // Display house details
        DOM.houseSize.textContent = `${houseDetails.size} sq ft`;
        DOM.windowCount.textContent = houseDetails.windows;

        // Display energy usage
        DOM.monthlyEnergy.textContent = `${energyUsage.monthly} kWh`;
        DOM.annualEnergy.textContent = `${energyUsage.annual} kWh`;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new HomeEnergyEstimator();
});