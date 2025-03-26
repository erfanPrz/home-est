// Configuration
const CONFIG = {
    ENDPOINTS: {
        NOMINATIM: 'https://nominatim.openstreetmap.org/search',
        CORS_PROXY: 'https://api.allorigins.win/raw?url=',
        ENERGY_DATA: 'https://api.eia.gov/v2/electricity/rto/region-data/data/'
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
    houseSizeRange: document.getElementById('houseSizeRange'),
    houseStyle: document.getElementById('houseStyle'),
    windowCount: document.getElementById('windowCount'),
    windowRange: document.getElementById('windowRange'),
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

            // Step 2: Get house details
            const houseDetails = this.estimateHouseDetails(addressData);
            console.log('House details calculated:', houseDetails);

            // Step 3: Get energy usage
            const energyUsage = await this.getEnergyUsage(addressData.latitude, addressData.longitude, addressData.region);
            console.log('Energy usage calculated:', energyUsage);

            // Step 4: Display all results
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

    estimateHouseDetails(addressData) {
        // Base house size varies by region and city type
        const baseSizeByRegion = {
            'Ontario': {
                'Toronto': 1800,
                'Mississauga': 2200,
                'Ottawa': 2000,
                'Hamilton': 1900,
                'default': 2000
            },
            'British Columbia': {
                'Vancouver': 1700,
                'Surrey': 2200,
                'Burnaby': 1900,
                'Victoria': 1800,
                'default': 2200
            },
            'Quebec': {
                'Montreal': 1600,
                'Quebec City': 1700,
                'Laval': 1900,
                'default': 1800
            },
            'Alberta': {
                'Calgary': 2100,
                'Edmonton': 2000,
                'Red Deer': 2200,
                'default': 2100
            },
            'default': 2000
        };

        // Get base size for the region and city
        const regionData = baseSizeByRegion[addressData.region] || baseSizeByRegion['default'];
        const baseSize = regionData[addressData.city] || regionData['default'];

        // Adjust size based on neighbourhood type (if available)
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

        // Add variation based on latitude (colder climates tend to have smaller houses)
        const latitudeFactor = 1 - (Math.abs(addressData.latitude) / 90) * 0.2;

        // Add random variation (±15%)
        const randomFactor = 0.85 + Math.random() * 0.3;

        // Calculate final size
        const estimatedSize = Math.round(baseSize * neighbourhoodFactor * latitudeFactor * randomFactor);

        // Calculate window count based on house size and style
        // More windows in modern homes, fewer in older homes
        const isModern = Math.random() > 0.5; // 50% chance of modern style
        const windowsPerSqFt = isModern ? 0.012 : 0.008; // Modern homes have more windows
        const windowCount = Math.round(estimatedSize * windowsPerSqFt);
        
        // Add variation to window count (±25%)
        const windowVariation = Math.round(windowCount * 0.25);

        return {
            size: estimatedSize,
            sizeRange: `${estimatedSize - 200} - ${estimatedSize + 200} sq ft`,
            windows: windowCount,
            windowRange: `${windowCount - windowVariation} - ${windowCount + windowVariation} windows`,
            style: isModern ? 'Modern' : 'Traditional'
        };
    }

    async getEnergyUsage(latitude, longitude, region) {
        try {
            // Base usage varies by region
            const baseUsageByRegion = {
                'Ontario': 900,
                'British Columbia': 850,
                'Quebec': 950,
                'Alberta': 1000,
                'Manitoba': 850,
                'Saskatchewan': 950,
                'Nova Scotia': 900,
                'New Brunswick': 850,
                'Newfoundland and Labrador': 900,
                'Prince Edward Island': 850,
                'Yukon': 1000,
                'Northwest Territories': 1200,
                'Nunavut': 1200
            };

            // Get the current month (0-11)
            const currentMonth = new Date().getMonth();
            
            // Seasonal factors based on month
            const seasonalFactors = {
                // Winter months (high heating)
                0: 1.4,  // January
                1: 1.3,  // February
                2: 1.2,  // March
                // Spring months (moderate)
                3: 0.9,  // April
                4: 0.8,  // May
                5: 0.7,  // June
                // Summer months (high cooling)
                6: 0.8,  // July
                7: 0.8,  // August
                8: 0.7,  // September
                // Fall months (moderate)
                9: 0.8,  // October
                10: 0.9, // November
                11: 1.2  // December
            };

            // Get base usage based on region or default to 900
            const baseUsage = baseUsageByRegion[region] || 900;

            // Apply seasonal factor
            const seasonalFactor = seasonalFactors[currentMonth];

            // Calculate latitude-based adjustment (higher latitudes have more seasonal variation)
            const latitudeFactor = Math.abs(Math.sin(latitude * Math.PI / 180)) * 0.2 + 0.8;

            // Calculate final monthly usage
            const monthlyUsage = baseUsage * seasonalFactor * latitudeFactor;

            // Add some random variation (±10%) to make it more realistic
            const variation = 0.9 + Math.random() * 0.2;
            const finalMonthlyUsage = monthlyUsage * variation;

            return {
                monthly: Math.round(finalMonthlyUsage),
                annual: Math.round(finalMonthlyUsage * 12)
            };
        } catch (error) {
            console.error('Error in getEnergyUsage:', error);
            throw new Error('Could not calculate energy usage.');
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
        DOM.houseSizeRange.textContent = houseDetails.sizeRange;
        DOM.houseStyle.textContent = houseDetails.style;
        DOM.windowCount.textContent = houseDetails.windows;
        DOM.windowRange.textContent = houseDetails.windowRange;

        // Display energy usage
        DOM.monthlyEnergy.textContent = `${energyUsage.monthly} kWh`;
        DOM.annualEnergy.textContent = `${energyUsage.annual} kWh`;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new HomeEnergyEstimator();
});