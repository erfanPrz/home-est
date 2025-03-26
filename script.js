// Configuration
const CONFIG = {
    API_KEYS: {
        POSITIONSTACK: '9989e2b906332c876816978ad07dbc32', 
        EIA: 'AOd1qrzqBUsSSgbWW9TpvGVEcfb1eU4ehjgOgO5t'
    },
    ENDPOINTS: {
        ADDRESS_VALIDATION: 'https://api.positionstack.com/v1/forward',
        ENERGY_DATA: 'https://api.eia.gov/v2/total-energy/data/'
    }
};
// DOM Elements: References to HTML elements for interaction
const DOM = {
    form: document.getElementById('addressForm'),
    addressInput: document.getElementById('addressInput'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    resultsContainer: document.getElementById('resultsContainer'),
    errorContainer: document.getElementById('errorContainer'),
    houseSizeResult: document.getElementById('houseSizeResult'),
    windowCountResult: document.getElementById('windowCountResult'),
    energyUsageResult: document.getElementById('energyUsageResult'),
    errorMessage: document.getElementById('errorMessage'),
    addressDetails: document.getElementById('addressDetails'),
    fullAddress: document.getElementById('fullAddress'),
    region: document.getElementById('region'),
    country: document.getElementById('country')
};

class HomeEnergyEstimator {
    constructor() {
        this.bindEvents();
    }
// Event binding for form submission
    bindEvents() {
        DOM.form.addEventListener('submit', this.handleSubmit.bind(this));
    }

    async handleSubmit(event) {
        event.preventDefault();
        const address = DOM.addressInput.value.trim();

        if (!address) {
            this.handleError(new Error('Please enter a valid address'));
            return;
        }

        this.resetUI();

        try {
            const addressData = await this.validateAddress(address);
            if (!addressData) throw new Error('Invalid address. Please enter a valid one.');
            
            this.displayAddressDetails(addressData);
            const energyData = await this.fetchEnergyUsage();
            const houseDetails = this.estimateHouseDetails(addressData);
            this.displayResults(houseDetails, energyData);
        } catch (error) {
            this.handleError(error);
        }
    }
    // Reset UI before making API requests
    resetUI() {
        DOM.loadingIndicator.classList.remove('hidden');
        DOM.resultsContainer.classList.add('hidden');
        DOM.errorContainer.classList.add('hidden');
        DOM.addressDetails.classList.add('hidden');
    }
 // Validate address using PositionStack API
    async validateAddress(address) {
        const url = `${CONFIG.ENDPOINTS.ADDRESS_VALIDATION}?access_key=${CONFIG.API_KEYS.POSITIONSTACK}&query=${encodeURIComponent(address)}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (!data.data || data.data.length === 0) {
                throw new Error('Address not found');
            }
            return data.data[0];
        } catch (error) {
            console.error('Address validation error:', error);
            throw new Error('Could not validate address');
        }
    }
  // Display validated address details
    displayAddressDetails(addressData) {
        DOM.fullAddress.textContent = addressData.label || 'N/A';
        DOM.region.textContent = addressData.region || 'N/A';
        DOM.country.textContent = addressData.country || 'N/A';
        DOM.addressDetails.classList.remove('hidden');
    }
 // Fetch average energy usage from EIA API
    async fetchEnergyUsage() {
        const url = `${CONFIG.ENDPOINTS.ENERGY_DATA}?frequency=monthly&data[0]=value&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=12&api_key=${CONFIG.API_KEYS.EIA}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (!data.response || !data.response.data) {
                throw new Error('Energy data unavailable');
            }
            const validData = data.response.data.filter(item => !isNaN(item.value));
            const avgEnergyUsage = validData.reduce((sum, item) => sum + item.value, 0) / validData.length;
            return avgEnergyUsage ? avgEnergyUsage.toFixed(2) : '650';
        } catch (error) {
            console.error('Energy usage fetch error:', error);
            return '650'; 
        }
    }
  // Estimate house details based on latitude and longitude
    estimateHouseDetails(locationData) {
        const { latitude, longitude } = locationData;
        const baseSize = 1200;
        const sizeVariation = Math.abs(Math.sin(latitude) * 500);
        const windowVariation = Math.abs(Math.cos(longitude) * 10);
        return {
            size: Math.round(baseSize + sizeVariation),
            windows: Math.round(10 + windowVariation)
        };
    }
  // Display calculated results on UI
    displayResults(houseDetails, energyUsage) {
        DOM.houseSizeResult.textContent = `${houseDetails.size} sq ft`;
        DOM.windowCountResult.textContent = `${houseDetails.windows} windows`;
        DOM.energyUsageResult.textContent = `${energyUsage} kWh/month`;

        DOM.loadingIndicator.classList.add('hidden');
        DOM.resultsContainer.classList.remove('hidden');
    }
    // Handle errors and display appropriate messages
    handleError(error) {
        DOM.loadingIndicator.classList.add('hidden');
        DOM.errorContainer.classList.remove('hidden');
        DOM.errorMessage.textContent = error.message;
    }
}
// Initialize the application when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    new HomeEnergyEstimator();
});
