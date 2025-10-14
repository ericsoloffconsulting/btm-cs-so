/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/url', 'N/currentRecord'], function(url, currentRecord) {
    
    /**
     * Page init function - adds the Create Deposit button
     */
    function pageInit(context) {
        // Add the Create Deposit button
        context.form.addButton({
            id: 'custpage_create_deposit',
            label: 'Create Deposit',
            functionName: 'createDeposit'
        });
    }
    
    /**
     * Function to navigate to customer deposit page
     */
    function createDeposit() {
        try {
            // Get the current record
            var record = currentRecord.get();
            
            // Get customer field if it exists on your custom record
            // Adjust field ID as needed for your custom record structure
            var customerId = record.getValue({
                fieldId: 'custrecord_wf_customer_from_so'
            });
            
            // Create URL parameters for the customer deposit
            var urlParams = {
                record: 'customerdeposit',
                operation: 'create'
            };
            
            // If customer is specified, add it to the URL
            if (customerId) {
                urlParams.customer = customerId;
            }
            
            // Generate the URL for the customer deposit page
            var depositUrl = url.resolveRecord(urlParams);
            
            // Navigate to the customer deposit page
            window.open(depositUrl, '_self');
            
        } catch (e) {
            console.error('Error creating deposit: ' + e.message);
            alert('Error navigating to deposit page: ' + e.message);
        }
    }
    
    // Make the createDeposit function globally available
    window.createDeposit = createDeposit;
    
    return {
        pageInit: pageInit
    };
});