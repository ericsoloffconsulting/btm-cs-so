/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget', 'N/search', 'N/log', 'N/url', 'N/record', 'N/redirect'], function (serverWidget, search, log, url, record, redirect) {

    /**
     * Handles GET and POST requests to the Suitelet
     * @param {Object} context - NetSuite context object containing request/response
     * @returns {void}
     */
    function onRequest(context) {
        if (context.request.method === 'GET') {
            var form = serverWidget.createForm({
                title: 'Wells Fargo Processing'
            });

            try {
                // Pass context to buildSearchResultsHTML
                var htmlContent = buildSearchResultsHTML(context);

                // Add the HTML field to display the search results
                var htmlField = form.addField({
                    id: 'custpage_search_results',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Search Results'
                });
                htmlField.defaultValue = htmlContent;

                // Add a refresh button
                form.addButton({
                    id: 'custpage_refresh',
                    label: 'Refresh',
                    functionName: 'refreshPage'
                });

            } catch (e) {
                log.error('Error in Wells Fargo Processing Suitelet', e.message);
                var errorField = form.addField({
                    id: 'custpage_error',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Error'
                });
                errorField.defaultValue = '<div style="color: red;">Error loading search results: ' + e.message + '</div>';
            }

            context.response.writePage(form);

        } else if (context.request.method === 'POST') {
            try {
                var action = context.request.parameters.action;

                if (action === 'create_deposit') {
                    var customerId = context.request.parameters.customer;
                    var amount = context.request.parameters.amount;
                    var wfAuthId = context.request.parameters.wfAuthId;
                    var salesOrderId = context.request.parameters.salesorder;
                    var departmentId = context.request.parameters.location;
                    var wfAuthNumber = context.request.parameters.wfAuthNumber;

                    log.debug('Creating Customer Deposit - Input Values', {
                        customer: customerId,
                        amount: amount,
                        wfAuthId: wfAuthId,
                        salesOrder: salesOrderId,
                        departmentId: departmentId,
                        wfAuthNumber: wfAuthNumber
                    });

                    // Validate inputs
                    if (!customerId || !amount) {
                        throw new Error('Missing required parameters: customer=' + customerId + ', amount=' + amount);
                    }

                    // Parse and validate numeric values
                    var customerIdInt = parseInt(customerId, 10);
                    var amountFloat = parseFloat(amount);
                    var salesOrderIdInt = salesOrderId ? parseInt(salesOrderId, 10) : null;
                    var departmentIdInt = departmentId ? parseInt(departmentId, 10) : 1;

                    if (isNaN(customerIdInt) || customerIdInt <= 0) {
                        throw new Error('Invalid customer ID: ' + customerId);
                    }

                    if (isNaN(amountFloat) || amountFloat <= 0) {
                        throw new Error('Invalid amount: ' + amount);
                    }

                    // Lookup fulfilling location from department record
                    var fulfillingLocationId = 1;
                    if (departmentIdInt) {
                        try {
                            fulfillingLocationId = lookupFulfillingLocation(departmentIdInt);
                        } catch (lookupError) {
                            log.error('Error looking up fulfilling location', {
                                error: lookupError.message,
                                departmentId: departmentIdInt
                            });
                        }
                    }

                    log.debug('Validated input values', {
                        customerIdInt: customerIdInt,
                        amountFloat: amountFloat,
                        salesOrderIdInt: salesOrderIdInt,
                        departmentIdInt: departmentIdInt,
                        fulfillingLocationId: fulfillingLocationId
                    });

                    // Create the Customer Deposit record
                    var depositRecord = record.create({
                        type: record.Type.CUSTOMER_DEPOSIT,
                        isDynamic: true
                    });

                    try {
                        // Set customer field
                        depositRecord.setValue({
                            fieldId: 'customer',
                            value: customerIdInt
                        });

                        // Set location (fulfilling location)
                        depositRecord.setValue({
                            fieldId: 'location',
                            value: fulfillingLocationId
                        });

                        // Set department (selling location)
                        depositRecord.setValue({
                            fieldId: 'department',
                            value: departmentIdInt
                        });

                        // Set transaction date
                        depositRecord.setValue({
                            fieldId: 'trandate',
                            value: new Date()
                        });


                        // Enhanced memo with more details
                        var memoText = 'Wells Fargo Customer Deposit - WF Auth #: ' + wfAuthNumber;
                        memoText += ' - WF Record ID: WF' + wfAuthId;

                        depositRecord.setValue({
                            fieldId: 'memo',
                            value: memoText
                        });

                        // Set the Wells Fargo Authorization link in custom body field
                        if (wfAuthId) {
                            depositRecord.setValue({
                                fieldId: 'custbody_linked_wells_fargo_authorizat',
                                value: parseInt(wfAuthId, 10)
                            });
                        }

                        // Set Sales Order reference if available
                        if (salesOrderIdInt) {
                            depositRecord.setValue({
                                fieldId: 'salesorder',
                                value: salesOrderIdInt
                            });
                        }

                        // Set payment amount
                        depositRecord.setValue({
                            fieldId: 'payment',
                            value: amountFloat
                        });

                        // Set payment method (ACH)
                        depositRecord.setValue({
                            fieldId: 'paymentmethod',
                            value: 12
                        });

                        // Save the Customer Deposit
                        var depositId = depositRecord.save();

                        log.audit('Customer Deposit Created Successfully', {
                            depositId: depositId,
                            customer: customerIdInt,
                            amount: amountFloat,
                            location: fulfillingLocationId,
                            department: departmentIdInt,
                            salesOrder: salesOrderIdInt,
                            wfAuthId: wfAuthId,
                            wfAuthNumber: wfAuthNumber
                        });

                        // Get the transaction ID from the newly created deposit
                        var depositTranId = '';
                        var wfAuthName = '';

                        try {
                            var savedDepositRecord = record.load({
                                type: record.Type.CUSTOMER_DEPOSIT,
                                id: depositId,
                                isDynamic: false
                            });
                            depositTranId = savedDepositRecord.getValue('tranid') || depositId;
                        } catch (loadError) {
                            log.error('Error loading deposit record for tranid', loadError.message);
                            depositTranId = depositId; // Fallback to ID
                        }

                        // Update the Wells Fargo Authorization record and get its name
                        if (wfAuthId) {
                            try {
                                // Get existing deposit links and append new deposit ID
                                var existingDepositLinks = getExistingDepositLinks(wfAuthId);
                                var updatedDepositLinks = appendDepositToMultipleSelect(existingDepositLinks, depositId);

                                // Get Wells Fargo Authorization name before updating
                                var wfAuthRecord = record.load({
                                    type: 'customrecord_bas_wf_auth',
                                    id: wfAuthId,
                                    isDynamic: false
                                });
                                wfAuthName = wfAuthRecord.getValue('name') || wfAuthId;

                                // Update the Wells Fargo Authorization record
                                record.submitFields({
                                    type: 'customrecord_bas_wf_auth',
                                    id: wfAuthId,
                                    values: {
                                        'custrecord_customer_deposit_link': updatedDepositLinks
                                    }
                                });

                                log.debug('Wells Fargo Auth record updated', {
                                    wfAuthId: wfAuthId,
                                    wfAuthName: wfAuthName,
                                    depositId: depositId,
                                    depositTranId: depositTranId,
                                    updatedDepositLinks: updatedDepositLinks
                                });

                            } catch (updateError) {
                                log.error('Error updating Wells Fargo Auth record', {
                                    error: updateError.message,
                                    wfAuthId: wfAuthId,
                                    depositId: depositId
                                });
                                // Set fallback values for success message
                                wfAuthName = wfAuthId;
                            }
                        }

                        // Redirect back to the same page with success message
                        redirect.toSuitelet({
                            scriptId: context.request.parameters.script,
                            deploymentId: context.request.parameters.deploy,
                            parameters: {
                                success: 'true',
                                depositTranId: depositTranId,
                                wfAuthName: wfAuthName
                            }
                        });

                    } catch (fieldError) {
                        log.error('Error setting fields on Customer Deposit', {
                            error: fieldError.message,
                            stack: fieldError.stack,
                            customer: customerIdInt,
                            amount: amountFloat,
                            departmentId: departmentIdInt,
                            fulfillingLocationId: fulfillingLocationId
                        });
                        throw fieldError;
                    }

                } else if (action === 'create_payment') {
                    var customerId = context.request.parameters.customer;
                    var amount = context.request.parameters.amount;
                    var wfAuthNumber = context.request.parameters.wfAuthNumber;
                    var invoiceNumber = context.request.parameters.invoiceNumber;

                    log.debug('Creating Customer Payment - Input Values', {
                        customer: customerId,
                        amount: amount,
                        wfAuthNumber: wfAuthNumber,
                        invoiceNumber: invoiceNumber
                    });

                    // Validate inputs
                    if (!customerId || !amount) {
                        throw new Error('Missing required parameters: customer=' + customerId + ', amount=' + amount);
                    }

                    // Parse and validate numeric values
                    var customerIdInt = parseInt(customerId, 10);
                    var amountFloat = parseFloat(amount);

                    if (isNaN(customerIdInt) || customerIdInt <= 0) {
                        throw new Error('Invalid customer ID: ' + customerId);
                    }

                    if (isNaN(amountFloat) || amountFloat <= 0) {
                        throw new Error('Invalid amount: ' + amount);
                    }

                    // Find the invoice to apply payment to
                    var invoiceId = null;
                    if (invoiceNumber) {
                        try {
                            invoiceId = findInvoiceByNumber(customerIdInt, invoiceNumber);
                            log.debug('Found invoice', {
                                invoiceNumber: invoiceNumber,
                                invoiceId: invoiceId
                            });
                        } catch (findError) {
                            log.error('Error finding invoice', {
                                error: findError.message,
                                invoiceNumber: invoiceNumber,
                                customerId: customerIdInt
                            });
                        }
                    }

                    // Create Customer Payment using transform if we have an invoice, otherwise create new
                    var paymentRecord;
                    var isTransformed = false;

                    if (invoiceId) {
                        try {
                            // Transform the invoice into a customer payment
                            paymentRecord = record.transform({
                                fromType: record.Type.INVOICE,
                                fromId: invoiceId,
                                toType: record.Type.CUSTOMER_PAYMENT,
                                isDynamic: true  // Required for dynamic sublist manipulation
                            });
                            isTransformed = true;

                            log.debug('Transformed invoice to payment', {
                                invoiceId: invoiceId,
                                invoiceNumber: invoiceNumber
                            });

                        } catch (transformError) {
                            log.error('Error transforming invoice to payment', {
                                error: transformError.message,
                                invoiceId: invoiceId
                            });

                            // Fallback to creating new payment
                            paymentRecord = record.create({
                                type: record.Type.CUSTOMER_PAYMENT,
                                isDynamic: true
                            });
                            isTransformed = false;
                        }
                    } else {
                        // Create new payment if no invoice found
                        paymentRecord = record.create({
                            type: record.Type.CUSTOMER_PAYMENT,
                            isDynamic: true
                        });
                        isTransformed = false;
                    }

                    try {
                        // Set customer field (if not already set by transform)
                        if (!isTransformed) {
                            paymentRecord.setValue({
                                fieldId: 'customer',
                                value: customerIdInt
                            });
                        }

                        // Set transaction date
                        paymentRecord.setValue({
                            fieldId: 'trandate',
                            value: new Date()
                        });

                        // Set payment method (ACH)
                        paymentRecord.setValue({
                            fieldId: 'paymentmethod',
                            value: 12
                        });

                        // Set memo with Wells Fargo information
                        var memoText = 'Wells Fargo Payment - Auth # ' + (wfAuthNumber || 'Unknown');
                        paymentRecord.setValue({
                            fieldId: 'memo',
                            value: memoText
                        });

                        // CRITICAL: Set payment amount BEFORE applying to invoice
                        // This ensures the payment header has the correct amount available
                        paymentRecord.setValue({
                            fieldId: 'payment',
                            value: amountFloat
                        });

                        log.debug('Payment amount set', {
                            amount: amountFloat,
                            isTransformed: isTransformed
                        });

                        // Apply payment to specific invoice if found and transformed
                        if (invoiceId && isTransformed) {
                            try {
                                // Get apply sublist line count
                                var applyLineCount = paymentRecord.getLineCount({
                                    sublistId: 'apply'
                                });

                                log.debug('Apply sublist info', {
                                    lineCount: applyLineCount,
                                    targetInvoiceId: invoiceId,
                                    isTransformed: isTransformed,
                                    paymentAmount: amountFloat
                                });

                                // For transformed records, the source invoice should already be on line 0
                                // We need to update the amount being applied using DYNAMIC MODE methods
                                var foundInvoice = false;

                                for (var line = 0; line < applyLineCount; line++) {
                                    // Select the line to work with it (DYNAMIC MODE REQUIRED)
                                    paymentRecord.selectLine({
                                        sublistId: 'apply',
                                        line: line
                                    });

                                    // Get the internal ID of the document on this line
                                    var applyInternalId = paymentRecord.getCurrentSublistValue({
                                        sublistId: 'apply',
                                        fieldId: 'doc'
                                    });

                                    log.debug('Checking apply line', {
                                        line: line,
                                        applyInternalId: applyInternalId,
                                        targetInvoiceId: invoiceId
                                    });

                                    if (parseInt(applyInternalId, 10) === parseInt(invoiceId, 10)) {
                                        foundInvoice = true;

                                        // Get the current apply status
                                        var isCurrentlyApplied = paymentRecord.getCurrentSublistValue({
                                            sublistId: 'apply',
                                            fieldId: 'apply'
                                        });

                                        log.debug('Found target invoice on apply sublist', {
                                            line: line,
                                            invoiceId: invoiceId,
                                            isCurrentlyApplied: isCurrentlyApplied,
                                            requestedAmount: amountFloat
                                        });

                                        // Set apply flag to true (if not already)
                                        if (!isCurrentlyApplied) {
                                            paymentRecord.setCurrentSublistValue({
                                                sublistId: 'apply',
                                                fieldId: 'apply',
                                                value: true
                                            });
                                        }

                                        // Set the amount to apply (this updates the line amount)
                                        paymentRecord.setCurrentSublistValue({
                                            sublistId: 'apply',
                                            fieldId: 'amount',
                                            value: amountFloat
                                        });

                                        // Commit the line changes (DYNAMIC MODE REQUIRED)
                                        paymentRecord.commitLine({
                                            sublistId: 'apply'
                                        });

                                        log.debug('Applied payment to invoice', {
                                            line: line,
                                            invoiceId: invoiceId,
                                            amount: amountFloat
                                        });
                                        break;
                                    }
                                }

                                if (!foundInvoice) {
                                    log.error('Target invoice not found on apply sublist', {
                                        targetInvoiceId: invoiceId,
                                        applyLineCount: applyLineCount
                                    });
                                }

                            } catch (applyError) {
                                log.error('Error applying payment to invoice', {
                                    error: applyError.message,
                                    stack: applyError.stack,
                                    invoiceId: invoiceId,
                                    amount: amountFloat
                                });
                                // Continue without applying - payment will still be created
                                // but may have the full invoice amount applied instead of custom amount
                            }
                        }

                        // Save the Customer Payment
                        var paymentId = paymentRecord.save();

                        log.audit('Customer Payment Created Successfully', {
                            paymentId: paymentId,
                            customer: customerIdInt,
                            amount: amountFloat,
                            wfAuthNumber: wfAuthNumber,
                            invoiceNumber: invoiceNumber,
                            invoiceId: invoiceId,
                            isTransformed: isTransformed
                        });

                        // Get the transaction ID from the newly created payment
                        var paymentTranId = '';
                        try {
                            var savedPaymentRecord = record.load({
                                type: record.Type.CUSTOMER_PAYMENT,
                                id: paymentId,
                                isDynamic: false
                            });
                            paymentTranId = savedPaymentRecord.getValue('tranid') || paymentId;
                        } catch (loadError) {
                            log.error('Error loading payment record for tranid', loadError.message);
                            paymentTranId = paymentId; // Fallback to ID
                        }

                        // Redirect back to the same page with success message
                        redirect.toSuitelet({
                            scriptId: context.request.parameters.script,
                            deploymentId: context.request.parameters.deploy,
                            parameters: {
                                success: 'true',
                                paymentTranId: paymentTranId,
                                paymentAmount: amountFloat,
                                appliedInvoice: invoiceNumber || 'N/A'
                            }
                        });

                    } catch (fieldError) {
                        log.error('Error setting fields on Customer Payment', {
                            error: fieldError.message,
                            stack: fieldError.stack,
                            customer: customerIdInt,
                            amount: amountFloat
                        });
                        throw fieldError;
                    }
                }

            } catch (e) {
                log.error('Error in POST processing', {
                    error: e.message,
                    stack: e.stack,
                    action: context.request.parameters.action,
                    customer: context.request.parameters.customer,
                    amount: context.request.parameters.amount
                });

                // Redirect back with error message
                redirect.toSuitelet({
                    scriptId: context.request.parameters.script,
                    deploymentId: context.request.parameters.deploy,
                    parameters: {
                        error: 'Error processing request: ' + e.message
                    }
                });
            }
        }
    }

    /**
     * Looks up the fulfilling location from a department record
     * @param {number} departmentId - The department ID to lookup
     * @returns {number} The fulfilling location ID
     */
    function lookupFulfillingLocation(departmentId) {
        try {
            log.debug('Looking up fulfilling location', 'Department ID: ' + departmentId);

            var departmentRecord = record.load({
                type: record.Type.DEPARTMENT,
                id: departmentId,
                isDynamic: false
            });

            var fulfillingLocationId = departmentRecord.getValue({
                fieldId: 'custrecord_bas_fulfilling_location'
            });

            if (fulfillingLocationId) {
                log.debug('Fulfilling location found', {
                    departmentId: departmentId,
                    fulfillingLocationId: fulfillingLocationId
                });
                return parseInt(fulfillingLocationId, 10);
            } else {
                log.debug('No fulfilling location found, using default', 'Department ID: ' + departmentId);
                return 1; // Default fallback
            }

        } catch (e) {
            log.error('Error looking up fulfilling location', {
                error: e.message,
                departmentId: departmentId
            });
            return 1; // Default fallback
        }
    }

    /**
     * Gets existing deposit links from Wells Fargo Authorization record
     * @param {string} wfAuthId - Wells Fargo Authorization ID
     * @returns {Array} Array of existing deposit IDs
     */
    function getExistingDepositLinks(wfAuthId) {
        try {
            var wfAuthRecord = record.load({
                type: 'customrecord_bas_wf_auth',
                id: wfAuthId,
                isDynamic: false
            });

            var existingLinks = wfAuthRecord.getValue('custrecord_customer_deposit_link');

            if (!existingLinks) {
                return [];
            }

            // Handle both single value and array
            if (Array.isArray(existingLinks)) {
                return existingLinks;
            } else {
                return [existingLinks];
            }

        } catch (e) {
            log.error('Error getting existing deposit links', {
                error: e.message,
                wfAuthId: wfAuthId
            });
            return [];
        }
    }

    /**
     * Appends new deposit ID to existing multiple select values
     * @param {Array} existingLinks - Array of existing deposit IDs
     * @param {string} newDepositId - New deposit ID to append
     * @returns {Array} Updated array of deposit IDs
     */
    function appendDepositToMultipleSelect(existingLinks, newDepositId) {
        var updatedLinks = existingLinks.slice(); // Create copy

        // Append new deposit ID to the array
        updatedLinks.push(parseInt(newDepositId, 10));

        return updatedLinks;
    }

    /**
   * Builds HTML content containing both search results
   * @param {Object} context - NetSuite context object containing request/response
   * @returns {string} HTML content string
   */
    function buildSearchResultsHTML(context) {
        var html = '<style>' +
            // Reset NetSuite default styles and remove borders
            '.uir-page-title-secondline { border: none !important; margin: 0 !important; padding: 0 !important; }' +
            '.uir-record-type { border: none !important; }' +
            '.bglt { border: none !important; }' +
            '.smalltextnolink { border: none !important; }' +

            // Main container styling
            '.wells-fargo-container { margin: 0; padding: 0; border: none; background: transparent; }' +

            // Table styling
            'table.search-table { border-collapse: collapse; width: 100%; margin: 15px 0; border: 1px solid #ddd; background: white; }' +
            'table.search-table th, table.search-table td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }' +
            'table.search-table th { background-color: #f8f9fa; font-weight: bold; color: #333; font-size: 12px; }' +
            'table.search-table tr:nth-child(even) td { background-color: #f9f9f9; }' +
            'table.search-table tr:hover td { background-color: #e8f4f8; }' +

            // Search title styling
            '.search-title { font-size: 16px; font-weight: bold; margin: 25px 0 8px 0; color: #333; padding: 8px 0; border-bottom: 2px solid #4CAF50; }' +
            '.search-count { font-style: italic; color: #666; margin: 5px 0 10px 0; font-size: 12px; }' +

            // Button styling
            '.action-btn { background-color: #4CAF50; color: white; padding: 6px 12px; border: none; cursor: pointer; border-radius: 4px; font-size: 11px; text-decoration: none; display: inline-block; transition: background-color 0.3s; }' +
            '.action-btn:hover { background-color: #45a049; text-decoration: none; }' +
            '.action-cell { text-align: center; white-space: nowrap; padding: 4px; }' +

            // Message styling
            '.success-msg { background-color: #d4edda; color: #155724; padding: 12px; border: 1px solid #c3e6cb; border-radius: 6px; margin: 15px 0; font-size: 13px; }' +
            '.error-msg { background-color: #f8d7da; color: #721c24; padding: 12px; border: 1px solid #f5c6cb; border-radius: 6px; margin: 15px 0; font-size: 13px; }' +

            // Hidden data containers
            '.hidden-data { display: none; }' +

            // Ensure clean container
            'body, html { margin: 0; padding: 0; }' +
            '</style>';

        // Add inline JavaScript functions
        html += '<script>' +
            'function refreshPage() { window.location.reload(); }' +

            // Prompt for deposit amount and submit
            'function promptAndSubmitDeposit(dataId, defaultAmount) {' +
            '    try {' +
            '        var amount = window.prompt("Enter deposit amount:", defaultAmount);' +
            '        if (amount === null) {' +
            '            return;' +
            '        }' +
            '        var numAmount = parseFloat(amount);' +
            '        if (isNaN(numAmount) || numAmount <= 0) {' +
            '            alert("Please enter a valid amount greater than zero");' +
            '            return;' +
            '        }' +
            '        numAmount = Math.round(numAmount * 100) / 100;' +
            '        ' +
            '        var dataContainer = document.getElementById(dataId);' +
            '        if (!dataContainer) {' +
            '            alert("Error: Data container not found - ID: " + dataId);' +
            '            return;' +
            '        }' +
            '        ' +
            '        var form = document.createElement("form");' +
            '        form.method = "POST";' +
            '        form.action = window.location.href;' +
            '        ' +
            '        var inputs = dataContainer.getElementsByTagName("input");' +
            '        for (var i = 0; i < inputs.length; i++) {' +
            '            var input = inputs[i].cloneNode(true);' +
            '            if (input.name === "amount") {' +
            '                input.value = numAmount.toFixed(2);' +
            '            }' +
            '            form.appendChild(input);' +
            '        }' +
            '        ' +
            '        document.body.appendChild(form);' +
            '        form.submit();' +
            '    } catch (e) {' +
            '        alert("Error: " + e.message);' +
            '    }' +
            '}' +

            // Prompt for payment amount and submit
            'function promptAndSubmitPayment(dataId, defaultAmount) {' +
            '    try {' +
            '        var amount = window.prompt("Enter payment amount:", defaultAmount);' +
            '        if (amount === null) {' +
            '            return;' +
            '        }' +
            '        var numAmount = parseFloat(amount);' +
            '        if (isNaN(numAmount) || numAmount <= 0) {' +
            '            alert("Please enter a valid amount greater than zero");' +
            '            return;' +
            '        }' +
            '        numAmount = Math.round(numAmount * 100) / 100;' +
            '        ' +
            '        var dataContainer = document.getElementById(dataId);' +
            '        if (!dataContainer) {' +
            '            alert("Error: Data container not found - ID: " + dataId);' +
            '            return;' +
            '        }' +
            '        ' +
            '        var form = document.createElement("form");' +
            '        form.method = "POST";' +
            '        form.action = window.location.href;' +
            '        ' +
            '        var inputs = dataContainer.getElementsByTagName("input");' +
            '        for (var i = 0; i < inputs.length; i++) {' +
            '            var input = inputs[i].cloneNode(true);' +
            '            if (input.name === "amount") {' +
            '                input.value = numAmount.toFixed(2);' +
            '            }' +
            '            form.appendChild(input);' +
            '        }' +
            '        ' +
            '        document.body.appendChild(form);' +
            '        form.submit();' +
            '    } catch (e) {' +
            '        alert("Error: " + e.message);' +
            '    }' +
            '}' +
            '</script>';

        // Main container
        html += '<div class="wells-fargo-container">';

        // Show success/error messages with XSS protection
        if (context && context.request.parameters.success) {
            html += '<div class="success-msg">';

            if (context.request.parameters.depositTranId) {
                // Deposit success message
                html += '<strong>Customer Deposit Created Successfully and Wells Fargo Authorization Record Updated</strong><br>';
                html += 'Customer Deposit: ' + escapeHtml(context.request.parameters.depositTranId || 'Unknown') + '<br>';
                html += 'Wells Fargo Authorization: ' + escapeHtml(context.request.parameters.wfAuthName || 'Unknown');
            } else if (context.request.parameters.paymentTranId) {
                // Payment success message
                html += '<strong>Customer Payment Created Successfully</strong><br>';
                html += 'Customer Payment: ' + escapeHtml(context.request.parameters.paymentTranId || 'Unknown') + '<br>';
                html += 'Amount: $' + escapeHtml(context.request.parameters.paymentAmount || 'Unknown') + '<br>';
                html += 'Applied to Invoice: ' + escapeHtml(context.request.parameters.appliedInvoice || 'N/A');
            }

            html += '</div>';
        }
        if (context && context.request.parameters.error) {
            html += '<div class="error-msg"><strong>Error:</strong> ' + escapeHtml(context.request.parameters.error) + '</div>';
        }

        // First Search: Wells Fargo Sales Order Customer Deposits
        html += '<div class="search-title">BAS Wells Fargo Sales Order Customer Deposits To Be Charged</div>';
        html += buildSearchTable('customsearch_bas_wells_fargo_so_cd', 10, 'deposit');

        // Second Search: A/R Aging (Wells Fargo Financing)
        html += '<div class="search-title">BAS A/R Aging (Wells Fargo Financing)</div>';
        html += buildSearchTable('customsearch5263', 16, 'payment');

        // Close main container
        html += '</div>';

        return html;
    }

    /**
     * Builds HTML table for a specific saved search
     * @param {string} searchId - The saved search ID
     * @param {number} expectedColumns - Expected number of columns to display
     * @param {string} actionType - Type of action ('deposit' or 'payment')
     * @returns {string} HTML table string
     */
    function buildSearchTable(searchId, expectedColumns, actionType) {
        try {
            var savedSearch = search.load({
                id: searchId
            });

            var searchResults = savedSearch.run();
            var resultsRange = searchResults.getRange({
                start: 0,
                end: 1000
            });

            if (resultsRange.length === 0) {
                return '<div class="search-count">No results found</div>';
            }

            var html = '<div class="search-count">Results: ' + resultsRange.length + '</div>';
            html += '<table class="search-table">';

            // Build header row
            html += '<thead><tr>';
            html += '<th>Action</th>';
            for (var col = 0; col < expectedColumns; col++) {
                try {
                    var columnLabel = resultsRange[0].columns[col] ?
                        (resultsRange[0].columns[col].label || 'Column ' + (col + 1)) :
                        'Column ' + (col + 1);
                    html += '<th>' + escapeHtml(columnLabel) + '</th>';
                } catch (e) {
                    html += '<th>Column ' + (col + 1) + '</th>';
                }
            }
            html += '</tr></thead>';

            // Build data rows
            html += '<tbody>';
            for (var i = 0; i < resultsRange.length; i++) {
                html += '<tr>';

                if (actionType === 'deposit') {
                    var mappedData = mapDepositColumns(resultsRange[i]);
                    var dataId = 'deposit_data_' + i;

                    html += '<td class="action-cell">';

                    // Hidden data container (NO FORM TAG - just a div with data)
                    html += '<div id="' + dataId + '" class="hidden-data">';
                    html += '<input type="hidden" name="action" value="create_deposit">';
                    html += '<input type="hidden" name="customer" value="' + escapeHtml(mappedData.customerId) + '">';
                    html += '<input type="hidden" name="salesorder" value="' + escapeHtml(mappedData.salesOrderId) + '">';
                    html += '<input type="hidden" name="amount" value="' + escapeHtml(mappedData.amount) + '">';
                    html += '<input type="hidden" name="wfAuthId" value="' + escapeHtml(mappedData.wfAuthId) + '">';
                    html += '<input type="hidden" name="location" value="' + escapeHtml(mappedData.location) + '">';
                    html += '<input type="hidden" name="wfAuthNumber" value="' + escapeHtml(mappedData.wfAuthNumber) + '">';
                    html += '</div>';

                    // Button that calls JavaScript function
                    html += '<button type="button" class="action-btn" onclick="promptAndSubmitDeposit(\'' + dataId + '\', \'' + escapeHtml(mappedData.amount) + '\')">Create Deposit</button>';
                    html += '</td>';

                } else if (actionType === 'payment') {
                    var paymentData = extractRowData(resultsRange[i], actionType);
                    var dataId = 'payment_data_' + i;

                    html += '<td class="action-cell">';

                    // Check if this is a Credit Memo
                    if (paymentData.transactionType === 'Credit Memo') {
                        html += '<span style="color: #666; font-style: italic; font-size: 11px;">Refund Manually</span>';
                    } else {
                        // Hidden data container (NO FORM TAG - just a div with data)
                        html += '<div id="' + dataId + '" class="hidden-data">';
                        html += '<input type="hidden" name="action" value="create_payment">';
                        html += '<input type="hidden" name="customer" value="' + escapeHtml(paymentData.customerId) + '">';
                        html += '<input type="hidden" name="amount" value="' + escapeHtml(paymentData.amount) + '">';
                        html += '<input type="hidden" name="wfAuthNumber" value="' + escapeHtml(paymentData.wfAuthNumber) + '">';
                        html += '<input type="hidden" name="invoiceNumber" value="' + escapeHtml(paymentData.invoiceNumber) + '">';
                        html += '</div>';

                        // Button that calls JavaScript function
                        html += '<button type="button" class="action-btn" onclick="promptAndSubmitPayment(\'' + dataId + '\', \'' + escapeHtml(paymentData.amount) + '\')">Create Payment</button>';
                    }

                    html += '</td>';
                }

                // Add regular data columns with selective HTML rendering
                for (var col = 0; col < expectedColumns; col++) {
                    try {
                        var cellValue = '';
                        if (resultsRange[i].columns[col]) {
                            cellValue = resultsRange[i].getValue(resultsRange[i].columns[col]) || '';
                            var textValue = resultsRange[i].getText(resultsRange[i].columns[col]);
                            if (textValue && textValue !== cellValue) {
                                cellValue = textValue;
                            }
                        }

                        // Check if this column should allow HTML rendering
                        var columnLabel = resultsRange[i].columns[col] ?
                            (resultsRange[i].columns[col].label || '') : '';

                        if (shouldAllowHtmlRendering(columnLabel)) {
                            html += '<td>' + sanitizeAllowedHtml(String(cellValue)) + '</td>';
                        } else {
                            html += '<td>' + escapeHtml(String(cellValue)) + '</td>';
                        }
                    } catch (e) {
                        html += '<td>Error</td>';
                    }
                }
                html += '</tr>';
            }
            html += '</tbody></table>';

            return html;

        } catch (e) {
            log.error('Error building table for search ' + searchId, e.message);
            return '<div class="error-msg">Error loading search ' + escapeHtml(searchId) + ': ' + escapeHtml(e.message) + '</div>';
        }
    }

    /**
     * Extracts relevant data from a search result row for pre-populating forms
     * @param {Object} result - Search result row
     * @param {string} actionType - Type of action being performed
     * @returns {Object} Extracted data object
     */
    function extractRowData(result, actionType) {
        var data = {};

        try {
            if (actionType === 'payment') {
                // Use column labels instead of indexes for reliability
                for (var i = 0; i < result.columns.length; i++) {
                    var column = result.columns[i];
                    var label = column.label || '';
                    var value = result.getValue(column) || '';

                    switch (label) {
                        case 'Customer':
                        case 'Customer Internal ID':
                            data.customerId = value;
                            break;
                        case 'Amount Remaining':
                        case 'Amount':
                            data.amount = value;
                            break;
                        case 'Wells Fargo Authorization #':
                        case 'WF Auth #':
                            data.wfAuthNumber = value;
                            break;
                        case 'Document #':
                        case 'Document Number':
                        case 'Invoice':
                            data.invoiceNumber = value;
                            break;
                        case 'Type':
                            data.transactionType = value;
                            break;
                        default:
                            break;
                    }
                }
            } else if (actionType === 'deposit') {
                // Keep existing deposit logic using mapDepositColumns
                var mappedData = mapDepositColumns(result);
                data.customerId = mappedData.customerId;
                data.salesOrderId = mappedData.salesOrderId;
                data.amount = mappedData.amount;
                data.wfAuthId = mappedData.wfAuthId;
                data.location = mappedData.location;
                data.wfAuthNumber = mappedData.wfAuthNumber;
            }
        } catch (e) {
            log.error('Error extracting row data', e.message);
        }

        return data;
    }
    /**
     * Determines if a column should allow HTML rendering based on column label
     * @param {string} columnLabel - The column label to check
     * @returns {boolean} True if HTML should be allowed
     */
    function shouldAllowHtmlRendering(columnLabel) {
        var htmlColumns = ['Terms Summary', 'Manufacturers'];
        return htmlColumns.indexOf(columnLabel) !== -1;
    }

    /**
     * Sanitizes HTML content to allow only safe tags
     * @param {string} html - HTML content to sanitize
     * @returns {string} Sanitized HTML content
     */
    function sanitizeAllowedHtml(html) {
        if (!html) return '';

        // Only allow specific safe HTML tags
        var allowedTags = {
            'b': true,
            'strong': true,
            'br': true,
            'i': true,
            'em': true
        };

        // Remove any script tags and event handlers first
        var cleaned = html.toString()
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/javascript:/gi, '');

        // Simple tag validation - only allow whitelisted tags
        cleaned = cleaned.replace(/<(\/?)([\w]+)([^>]*)>/gi, function (match, slash, tagName, attributes) {
            var lowerTagName = tagName.toLowerCase();
            if (allowedTags[lowerTagName]) {
                // For allowed tags, remove any attributes (for simplicity)
                if (lowerTagName === 'br') {
                    return '<' + slash + lowerTagName + '>';
                } else {
                    return '<' + slash + lowerTagName + '>';
                }
            }
            return ''; // Remove disallowed tags
        });

        return cleaned;
    }

    /**
     * Enhanced HTML escape function with comprehensive character coverage
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        if (!text) return '';
        return text.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Maps Wells Fargo deposit search columns by header name to extract relevant data
     * @param {Object} result - Search result row
     * @returns {Object} Mapped deposit data
     */
    function mapDepositColumns(result) {
        var mappedData = {
            customerId: '',
            salesOrderId: '',
            amount: '',
            wfAuthId: result.id,
            location: '',
            wfAuthNumber: ''
        };

        try {
            for (var i = 0; i < result.columns.length; i++) {
                var column = result.columns[i];
                var label = column.label || '';
                var value = result.getValue(column) || '';

                switch (label) {
                    case 'Customer Internal ID':
                        mappedData.customerId = value;
                        break;
                    case 'Sales Order Internal ID':
                        mappedData.salesOrderId = value;
                        break;
                    case 'Customer Deposit Amount':
                        mappedData.amount = value;
                        break;
                    case 'Selling Location':
                        mappedData.location = value; // This is the department ID
                        break;
                    case 'Wells Fargo Authorization #':
                        mappedData.wfAuthNumber = value;
                        break;
                    default:
                        break;
                }
            }

        } catch (e) {
            log.error('Error mapping deposit columns', e.message);
        }

        return mappedData;
    }

    /**
     * Generates NetSuite URL for creating a record with pre-populated data
     * @param {string} recordType - The type of record to create
     * @param {Object} data - Data object containing field values
     * @returns {string} Generated URL string
     */
    function generateRecordUrl(recordType, data) {
        try {
            var baseUrl = url.resolveRecord({
                recordType: recordType,
                isEditMode: false
            });

            var params = [];
            for (var key in data) {
                if (data[key]) {
                    params.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
                }
            }

            if (params.length > 0) {
                baseUrl += (baseUrl.indexOf('?') > -1 ? '&' : '?') + params.join('&');
            }

            return baseUrl;

        } catch (e) {
            log.error('Error generating record URL', e.message);
            return '#';
        }
    }

    /**
     * Escapes HTML characters to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        if (!text) return '';
        return text.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
    * Finds an invoice by document number for a specific customer
    * @param {number} customerId - The customer internal ID
    * @param {string} invoiceNumber - The invoice document number
    * @returns {number|null} The invoice internal ID or null if not found
    */
    function findInvoiceByNumber(customerId, invoiceNumber) {
        try {
            var invoiceSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['entity', 'anyof', customerId],
                    'AND',
                    ['tranid', 'is', invoiceNumber],
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: ['internalid']
            });

            var searchResults = invoiceSearch.run().getRange({
                start: 0,
                end: 1
            });

            if (searchResults.length > 0) {
                return parseInt(searchResults[0].getValue('internalid'), 10);
            }

            return null;

        } catch (e) {
            log.error('Error finding invoice by number', {
                error: e.message,
                customerId: customerId,
                invoiceNumber: invoiceNumber
            });
            return null;
        }
    }

    return {
        onRequest: onRequest
    };
});