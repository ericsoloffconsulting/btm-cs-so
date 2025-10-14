/**
 * CONFIDENTIAL AND PROPRIETARY SOURCE CODE.
 *
 * Use and distribution of this code is subject to applicable licenses and the permission of the code owner.
 * This notice does not indicate the actual or intended publication of this source code.
 *
 * Portions developed for Bray & Scarff by BTM Global LLC
 * and are the property of Bray & Scarff.
 *
 * =====================================================================================================================
 * Version   Date         Author      Remarks
 * 1.0       2023-01-18   Thanh Duong BZ58751 - [BAS] - Vendor Rebate Automation implementation
 * 1.1       2024-01-18   Toan Le     BZ58752 - [BAS] - Commission Automation Implementation (Sales Rep Defaulting)
 * 1.2       2024-02-15   Trinh Vo    BZ61570 - [BAS] - Blackout Dates
 * 1.3       2024-02-23   Toan Le     BZ58752 - [BAS] - Commission Automation Implementation (Remove BTM Unit Cost)
 * 1.4       2024-02-27   Trinh Vo    BZ61709 - [BAS] - 50% Tax Requirement FRD
 * 1.5       2024-03-18   Trinh Vo    BZ61570 - [BAS] - Blackout Dates (comment #4) - remove 1.2 function and change by function in "btm_ue_so.js"
 * 1.6       2024-05-17   Eric Soloff Consulting      - Added Back 1.2 Function for Add-On Date Functionality with customsearch2936
 * 1.7       2025-08-08   Eric Soloff Consulting      - Added 1.2.1 Function for Add-On Date Functionality with customsearch7521 for Whitt Electric on fieldChanged and validateLine
 * 1.8       2025-08-12   Eric Soloff Consulting      - Shipping Distance Calculation with Google Distance Matrix API on fieldChanged and saveRecord, see functions getDistance and clearShipDate
 * 1.9       2025-10-13   Eric Soloff Consulting      - Added Wells Fargo Kitchen Works Payment Terms Logic on saveRecord and function checkWellsFargoKitchenWorks
 */

/**`
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */

define(['N/currentRecord', 'N/search', 'N/format', 'N/runtime', 'N/record', 'N/https', './btm_cs_50_percent_tax', '../lib/btm_lib_blackout_dates'],

    (currentRecordModule, search, format, runtime, record, https, WarrantyTaxCodeLib, blackoutDatesLib) => {



        //region 1.2 Functions

        /**
         * The function check to get all Blackout Dates of target Saved Search and save them to window.allBlackoutDates variable
         */
        const findTheBlackoutDates = () => {
            try {
                if (!window.allBlackoutDates) {
                    log.debug('Log', 'Find the blackout dates func - bz 61570...');

                    window.allBlackoutDates = [];
                    const blackoutDateSearch = search.load({ id: 'customsearch2936' });
                    if (blackoutDateSearch) {
                        const itemSearchPagedData = blackoutDateSearch.runPaged({ pageSize: 1000 });
                        for (let i = 0; i < itemSearchPagedData.pageRanges.length; i++) {

                            const itemSearchPage = itemSearchPagedData.fetch({ index: i });
                            itemSearchPage.data.forEach(result => {
                                const blackoutDate = result.getValue('custrecord_bas_delivery_date');
                                if (blackoutDate) {
                                    window.allBlackoutDates.push(blackoutDate);
                                }
                            });
                        }
                    } else {
                        log.error('Can\'t find the Blackout Date Search.', 'Fail to load search \'customsearch2936\'!');

                    }

                    log.debug(`Blackout dates`, window.allBlackoutDates);
                }
            } catch (e) {
                log.error('Error Find the blackout dates func - bz 61570', e);
            }

        }

        //endregion 1.2 Functions

        //region 1.2.1 Whitt Electric Functions


        /**
         * The function to check if the item code 00401 for Whitt Electric is used on any of the items in the item sublist.
         * */


        function checkIfItemExists(currentRecord) {
            try {
                const lineCount = currentRecord.getLineCount({ sublistId: 'item' });
                log.debug('Line Count', `There are ${lineCount} lines in the item sublist.`);

                for (let i = 0; i < lineCount; i++) {
                    const itemName = currentRecord.getSublistText({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });

                    const quantity = currentRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        line: i
                    });

                    const quantityBilled = currentRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantitybilled',
                        line: i
                    });

                    if (itemName && itemName.includes('00401')) {
                        log.debug('Item Found', `The item "${itemName}" includes "00401" on line ${i + 1}.`);

                        // Check if quantity minus quantity billed is greater than 0
                        if ((quantity - quantityBilled) > 0) {
                            log.debug('Quantity Remaining Check', `For item "${itemName}" on line ${i + 1}, quantity (${quantity}) minus quantity billed (${quantityBilled}) is greater than 0.`);
                            return true; // Exit early if the condition is met
                        } else {
                            log.debug('Quantity Remaining Check', `For item "${itemName}" on line ${i + 1}, quantity (${quantity}) minus quantity billed (${quantityBilled}) is not greater than 0.`);
                        }
                    }
                }

                log.debug('Item Check', 'No items with "00401" found on the sales order or the quantity remaining condition is not met.');
                return false; // No matching item found or condition not met
            } catch (e) {
                log.error('Error in checkIfItemExists', e);
                return false;
            }
        }

        /**
         * The function check to get all Whitt Electric Blackout Dates of target Saved Search and save them to window.allWhittBlackoutDates variable
         */


        const findTheWhittBlackoutDates = () => {
            try {
                if (!window.allBlackoutWhittDates) {
                    log.debug('Log', 'Find the Whitt Electric blackout dates func');

                    window.allBlackoutWhittDates = [];
                    const blackoutWhittDateSearch = search.load({ id: 'customsearch7521' });
                    if (blackoutWhittDateSearch) {
                        const itemSearchPagedData = blackoutWhittDateSearch.runPaged({ pageSize: 1000 });
                        for (let i = 0; i < itemSearchPagedData.pageRanges.length; i++) {

                            const itemSearchPage = itemSearchPagedData.fetch({ index: i });
                            itemSearchPage.data.forEach(result => {
                                const blackoutWhittDate = result.getValue('custrecord_bas_delivery_date');
                                if (blackoutWhittDate) {
                                    window.allBlackoutWhittDates.push(blackoutWhittDate);
                                }
                            });
                        }
                    } else {
                        log.error('Can\'t find the Whitt Electric Blackout Date Search.', 'Fail to load search \'customsearch7521\'!');

                    }

                    log.debug(`Blackout Whitt Electric dates`, window.allBlackoutWhittDates);
                }
            } catch (e) {
                log.error('Error Find the Whitt Electric blackout dates func', e);
            }

        }

        //endregion 1.2.1 Whitt Electric Functions


        /**
         * Function to be executed after page is initialized.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.mode - The mode in which the record is being accessed (create, copy, or edit)
         */

        const pageInit = (scriptContext) => {
            // 1.4 - 50% Tax Requirement FRD
            WarrantyTaxCodeLib.pageInit(scriptContext);

        }


        /**
         * Function to be executed when field is changed.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         * @param {string} scriptContext.fieldId - Field name
         * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field
         * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field
         *
         * @since 2015.2
         */
        const fieldChanged = (scriptContext) => {
            const { fieldId, sublistId } = scriptContext;
            let currentRecord = currentRecordModule.get();


            // 1.8 - Shipping Distance Calculation with Google Distance Matrix API
            try {
                if (currentRecord.type === record.Type.SALES_ORDER) {
                    // Scenario 1: Entity is changed
                    if (fieldId === 'entity') {
                        try {
                            log.debug('Scenario 1', 'Entity field changed. Running getDistance and analyzeDistance if shipdate is a future date.');
                            const shipAddress = currentRecord.getValue('shipaddress');
                            const shipDate = currentRecord.getValue('shipdate');

                            if (shipAddress) {
                                const distance = getDistance(currentRecord, shipAddress);
                                currentRecord.setValue({ fieldId: 'custbody_shipping_distance', value: distance || '' });

                                if (shipDate && new Date(shipDate) > new Date()) {
                                    log.debug('Scenario 1', 'Shipdate is a future date. Running analyzeDistance.');
                                    analyzeDistance(currentRecord, shipDate, parseFloat(distance));
                                }
                            }
                        } catch (e) {
                            log.error('Scenario 1', `Error processing entity change: ${e.message}`);
                        }
                    }

                    // Scenario 2: Shipaddress is changed
                    if (fieldId === 'shipaddress') {
                        try {
                            log.debug('Scenario 2', 'Shipaddress field changed. Running getDistance and analyzeDistance if shipdate is a future date.');
                            const shipAddress = currentRecord.getValue('shipaddress');
                            const shipDate = currentRecord.getValue('shipdate');

                            if (shipAddress) {
                                const distance = getDistance(currentRecord, shipAddress);
                                currentRecord.setValue({ fieldId: 'custbody_shipping_distance', value: distance || '' });

                                if (shipDate && new Date(shipDate) > new Date()) {
                                    log.debug('Scenario 2', 'Shipdate is a future date. Running analyzeDistance.');
                                    analyzeDistance(currentRecord, shipDate, parseFloat(distance));
                                }
                            }
                        } catch (e) {
                            log.error('Scenario 2', `Error processing shipaddress change: ${e.message}`);
                        }
                    }

                    // Scenario 3: Shipdate is changed
                    if (fieldId === 'shipdate') {
                        try {
                            log.debug('Scenario 3', 'Shipdate field changed. Running getDistance if distance is empty or 0.');
                            const shipAddress = currentRecord.getValue('shipaddress');
                            const shipDate = currentRecord.getValue('shipdate');
                            let shippingDistance = currentRecord.getValue('custbody_shipping_distance');

                            // Run getDistance if shipping distance is empty, null, undefined, or 0
                            if ((!shippingDistance || shippingDistance === 0) && shipAddress) {
                                log.debug('Scenario 3', 'Shipping distance is empty or 0. Running getDistance.');
                                shippingDistance = getDistance(currentRecord, shipAddress);
                                currentRecord.setValue({ fieldId: 'custbody_shipping_distance', value: shippingDistance || '' });
                            }

                            if (shipDate && new Date(shipDate) > new Date()) {
                                log.debug('Scenario 3', 'Shipdate is a future date. Running analyzeDistance.');
                                analyzeDistance(currentRecord, shipDate, parseFloat(shippingDistance));
                            } else {
                                log.debug('Scenario 3', 'Shipdate is not a future date or is empty. Skipping analyzeDistance.');
                            }
                        } catch (e) {
                            log.error('Scenario 3', `Error processing shipdate change: ${e.message}`);
                        }
                    }
                } // End of sales order check
            } catch (e) {
                log.error('Shipping Distance Calculation error', e);
            }




            try {
                // region - BZ58751 - [BAS] - Vendor Rebate Automation implementation
                if (scriptContext.sublistId === 'item' && (['item', 'quantity', 'price'].includes(scriptContext.fieldId))) {
                    let currentRecord = scriptContext.currentRecord
                    let recTrandate = format.format({
                        value: currentRecord.getValue('trandate'),
                        type: format.Type.DATE
                    }),
                        recCurrency = currentRecord.getValue('currency'),
                        itemId = currentRecord.getCurrentSublistValue({
                            sublistId: scriptContext.sublistId,
                            fieldId: 'item'
                        }),
                        rebatedInstant = 0;
                    console.log('recTrandate', recTrandate);
                    if (currentRecord.getValue('trandate') && currentRecord.getValue('currency')) {
                        search.create({
                            type: "customrecord_btm_reb_agree",
                            filters:
                                [
                                    ["custrecord_btm_rebate_end", "onorafter", recTrandate],
                                    "AND",
                                    ["custrecord_btm_rebate_start", "onorbefore", recTrandate],
                                    "AND",
                                    ["custrecord_btm_rebate_cur", "anyof", recCurrency],
                                    "AND",
                                    ["custrecord_btm_reb_detail_reb.custrecord_btm_reb_detail_item", "anyof", itemId]
                                ],
                            columns:
                                [
                                    search.createColumn({
                                        name: "custrecord_btm_reb_detail_inst_reb",
                                        join: "CUSTRECORD_BTM_REB_DETAIL_REB",
                                        label: "Instant Rebate"
                                    }),
                                    'custrecord_btm_rebate_vendor'
                                ]
                        }).run().each(result => {
                            rebatedInstant = +result.getValue({
                                name: "custrecord_btm_reb_detail_inst_reb",
                                join: "CUSTRECORD_BTM_REB_DETAIL_REB",
                                label: "Instant Rebate"
                            })
                            currentRecord.setCurrentSublistValue({
                                sublistId: scriptContext.sublistId,
                                fieldId: 'custcol_btm_so_ins_rebate',
                                value: rebatedInstant
                            })
                            currentRecord.setCurrentSublistValue({
                                sublistId: scriptContext.sublistId,
                                fieldId: 'custcol_btm_ven_reb',
                                value: result.getValue('custrecord_btm_rebate_vendor')
                            })
                            return false;
                        });
                    }
                }
                // endregion

                // region - BZ58752 - [BAS] - Commission Automation Implementation (Sales Rep Defaulting)
                if (scriptContext.fieldId === 'entity') {
                    let currentUser = runtime.getCurrentUser();

                    let userLookup = search.lookupFields({
                        type: search.Type.EMPLOYEE,
                        id: currentUser.id,
                        columns: 'issalesrep'
                    });

                    if (userLookup.issalesrep) {
                        scriptContext.currentRecord.setValue({ fieldId: 'salesrep', value: currentUser.id });
                    }
                }
                // endregion

                // region - BZ58752 - [BAS] - Commission Automation Implementation (Remove BTM Unit Cost)
                if (scriptContext.sublistId === 'item' && scriptContext.fieldId === 'item') {
                    scriptContext.currentRecord.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'custcol_btm_unit_cost',
                        value: ''
                    });
                }
                // endregion

            } catch (e) {
                console.log('btm_cs_so_up_reb_ins', e)
            }

            //region 1.2 Blackout Dates
            try {
                if (currentRecord.type === record.Type.SALES_ORDER) {
                    const { isRoleActiveBlackoutDate } = blackoutDatesLib;
                    const currentRole = runtime.getCurrentUser().role;


                    if (((!sublistId && fieldId === 'shipdate')
                        || (sublistId === 'item' && fieldId === 'custcol_btm_item_ship_date'))
                        && isRoleActiveBlackoutDate({ idRole: currentRole })
                    ) {

                        log.debug('Log', 'Start to check value of shipdate with blackout date.');
                        findTheBlackoutDates();




                        //Get the target ship date (in body or line item)
                        let shipDateValue;
                        if (!sublistId && fieldId === 'shipdate') shipDateValue = currentRecord.getText({ fieldId: fieldId });
                        else if (sublistId === 'item' && fieldId === 'custcol_btm_item_ship_date') shipDateValue = currentRecord.getCurrentSublistText({
                            sublistId: sublistId,
                            fieldId: fieldId
                        });






                        if (shipDateValue) {
                            if (window.allBlackoutDates && window.allBlackoutDates.includes(shipDateValue)) {

                                log.debug('Log', `[${shipDateValue}] is the blackout date => can't set to shipdate.`);

                                //Show error msg and clear value of target field
                                alert(`This date is closed for shipments, please select another date.`);
                                if (!sublistId && fieldId === 'shipdate') currentRecord.setValue({
                                    fieldId: fieldId,
                                    value: null,
                                });
                                else if (sublistId === 'item' && fieldId === 'custcol_btm_item_ship_date') {
                                    // currentRecord.setSublistValue({ sublistId: sublistId, fieldId: fieldId, line: line, value: null });
                                    currentRecord.setCurrentSublistValue({
                                        sublistId: sublistId,
                                        fieldId: fieldId,
                                        value: null
                                    });
                                }

                            } else {

                                log.debug('Log', `[${shipDateValue}] isn't the blackout date => valid shipdate.`);

                                // Call the checkIfItemExists function
                                const itemExists = checkIfItemExists(currentRecord);
                                if (itemExists) {
                                    log.debug('Validation', 'The sales order contains the item with "00401".');
                                    findTheWhittBlackoutDates();

                                    // Validate against Whitt Electric blackout dates
                                    if (shipDateValue && window.allBlackoutWhittDates && window.allBlackoutWhittDates.includes(shipDateValue)) {
                                        log.debug('Log', `[${shipDateValue}] is the Whitt Electric blackout date => can't set to shipdate.`);

                                        // Show error message and clear the value of the target field
                                        alert(`This sales order includes a Whitt Electric 00401 item code remaining to be completed and this date is closed for Whitt Electric, please select another date.`);
                                        clearShipDate(currentRecord, sublistId, fieldId);
                                    } else {
                                        log.debug('Log', `[${shipDateValue}] isn't the Whitt Electric blackout date => valid shipdate.`);
                                    }
                                } else {
                                    log.debug('Validation', 'The sales order does not contain the item with "00401" or the quantity remaining condition is not met.');
                                }



                            }
                        }

                    }
                }
            } catch (e) {
                log.error('Blackout Dates error', e);
            }
            //endregion 1.2 Blackout Dates


            //1.4 - 50% Tax Requirement FRD
            WarrantyTaxCodeLib.fieldChanged(scriptContext);


        }

        /**
         * Function to be executed when field is slaved.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         * @param {string} scriptContext.fieldId - Field name
         *
         * @since 2015.2
         */
        const postSourcing = (scriptContext) => {
            //1.4 - 50% Tax Requirement FRD
            WarrantyTaxCodeLib.postSourcing(scriptContext);
        }

        /**
         * Function to be executed after sublist is inserted, removed, or edited.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @since 2015.2
         */
        const sublistChanged = (scriptContext) => {
            console.log(`sublistChanged: ${scriptContext.sublistId}`);
        }

        /**
         * Function to be executed after line is selected.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @since 2015.2
         */
        const lineInit = (scriptContext) => {

        }

        /**
         * Validation const to be executed when field is changed.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         * @param {string} scriptContext.fieldId - Field name
         * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field
         * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field
         *
         * @returns {boolean} Return true if field is valid
         *
         * @since 2015.2
         */
        const validateField = (scriptContext) => {


        }

        /**
         * Validation const to be executed when sublist line is committed.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @returns {boolean} Return true if sublist line is valid
         *
         * @since 2015.2
         */
        const validateLine = (scriptContext) => {
            try {
                const currentRecord = scriptContext.currentRecord;
                const sublistId = scriptContext.sublistId;

                // Check if the record type is a sales order
                if (currentRecord.type === record.Type.SALES_ORDER) {
                    // Check if the sublist is 'item'
                    if (sublistId === 'item') {
                        // Check if the line is newly added by verifying if the internal ID is empty
                        const lineInternalId = currentRecord.getCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'id'
                        });
                        // If the line has an internal ID, it means it's an existing line
                        if (lineInternalId) {
                            return true; // Skip validation for existing lines
                        }
                        // If the line is newly added, check if the item name includes "00401"
                        const itemName = currentRecord.getCurrentSublistText({
                            // Get the item name from the sublist
                            sublistId: 'item',
                            fieldId: 'item'
                        });
                        // Check if the item name includes "00401"
                        if (itemName && itemName.includes('00401')) {
                            // If the item includes "00401", run findTheBlackoutDates to populate blackout dates
                            log.debug('validateLine', 'Item includes "00401". Running findTheWhittBlackoutDates.');

                            // Run findTheWhittBlackoutDates to populate blackout dates
                            findTheWhittBlackoutDates();

                            // Get the ship date value from the sublist
                            let shipDateValue = currentRecord.getCurrentSublistText({
                                sublistId: 'item',
                                fieldId: 'custcol_btm_item_ship_date'
                            });
                            // If shipDateValue is empty, try to get it from the header
                            if (!shipDateValue) {
                                shipDateValue = currentRecord.getText({
                                    fieldId: 'shipdate'
                                });
                            }

                            // Compare shipDateValue with Whitt Electric blackout dates
                            if (shipDateValue && window.allBlackoutWhittDates && window.allBlackoutWhittDates.includes(shipDateValue)) {
                                alert(`This newly added line item is for Whitt Electric. The selected Ship Date (${shipDateValue}) is closed for Whitt Electric. The Ship Date has been cleared. Please select another ship date.`);
                                clearShipDate(currentRecord, null, 'shipdate'); // Clear the ship date in the header
                                clearShipDate(currentRecord, 'item', 'custcol_btm_item_ship_date'); // Clear the ship date in the sublist
                                log.debug('validateLine', `Ship Date (${shipDateValue}) is a Whitt Electric blackout date. Cleared ship date.`);
                            }
                        }
                    }
                }
            } catch (e) {
                log.error('Error in validateLine', e);
            }
            return true; // Ensure the line is valid
        };

        /**
         * Validation const to be executed when sublist line is inserted.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @returns {boolean} Return true if sublist line is valid
         *
         * @since 2015.2
         */
        const validateInsert = (scriptContext) => {

        }

        /**
         * Validation const to be executed when record is deleted.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @returns {boolean} Return true if sublist line is valid
         *
         * @since 2015.2
         */
        const validateDelete = (scriptContext) => {

        }

        /**
         * Validation const to be executed when record is saved.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @returns {boolean} Return true if record is valid
         *
         * @since 2015.2
         */
        const saveRecord = (scriptContext) => {
            try {
                // 1.9 - Wells Fargo Kitchen Works Payment Terms Logic on saveRecord only for Sales Order
                if (scriptContext.currentRecord.type === record.Type.SALES_ORDER) {
                    checkWellsFargoKitchenWorks(scriptContext.currentRecord);
                }
                return true;
            } catch (e) {
                log.error('Error in saveRecord', e);
                return true;
            }
        };

        /**
         * Helper function to clear the ship date value and related fields.
         * @param {Object} currentRecord - The current record object.
         * @param {string} sublistId - The sublist ID (if applicable).
         * @param {string} fieldId - The field ID to clear.
         */
        function clearShipDate(currentRecord, sublistId, fieldId) {
            if (!sublistId && fieldId === 'shipdate') {
                // Clear the shipdate field
                currentRecord.setValue({
                    fieldId: fieldId,
                    value: null,
                });

            } else if (sublistId === 'item' && fieldId === 'custcol_btm_item_ship_date') {
                // Clear the custcol_btm_item_ship_date field
                currentRecord.setCurrentSublistValue({
                    sublistId: sublistId,
                    fieldId: fieldId,
                    value: null,
                });

            }
        }

        /**
         * Function to calculate the shipping distance using Google Distance Matrix API.
         *
         * @param {Object} currentRecord - The current record object.
         * @param {string} locationId - The internal ID of the location.
         * @param {string} shipAddress - The shipping address.
         * @returns {string|null} - The calculated distance in miles, or null if the distance could not be determined.
         */
        function getDistance(currentRecord, shipAddress) {
            try {
                log.debug('getDistance', `Ship Address: ${shipAddress}`);

                // Ensure shipAddress is provided
                if (!shipAddress) {
                    log.debug('getDistance', 'Ship Address is missing.');
                    return null;
                }

                // Lookup the origin address from the location record
                // const locationValues = search.lookupFields({
                //     type: 'location',
                //     id: locationId,
                //     columns: ['address.address']
                // });

                // const originAddress = locationValues['address.address'];
                // if (!originAddress) {
                //     log.debug('getDistance', 'Origin address is missing.');
                //     return null;
                // }

                // log.debug('getDistance', `Origin Address: ${originAddress}`);

                // Use hardcoded origin address instead of looking up from location
                const originAddress = '8610 Cherry Lane, Laurel, Maryland 20707';
                log.debug('getDistance', `Using hardcoded Origin Address: ${originAddress}`);

                // Retrieve the API key from the custom record
                const apiKeySearch = search.create({
                    type: 'customrecord_btm_cfg',
                    filters: [],
                    columns: ['custrecord_btm_cfg_distance_api_key']
                });

                let apiKey = null;
                apiKeySearch.run().each(result => {
                    apiKey = result.getValue('custrecord_btm_cfg_distance_api_key');
                    return false; // Exit after retrieving the first result
                });

                if (!apiKey) {
                    log.error('API Key Error', 'API key not found in custom record.');
                    return null;
                }

                log.debug('getDistance', `Using API Key from custrecord_btm_cfg_distance_api_key: ${apiKey ? 'Provided' : 'Not Provided'}`);

                const unit = 'imperial';

                // Attempt to calculate distance with the full shipAddress
                let response = https.get({
                    url: `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(originAddress)}&destinations=${encodeURIComponent(shipAddress)}&units=${unit}&key=${apiKey}`
                });

                log.debug('getDistance', `Distance response ${response.code}: ${response.body}`);

                // Parse the response and extract the distance and destination address
                if (response.code === 200) {
                    const distanceData = JSON.parse(response.body);

                    if (distanceData.status === 'OK' && distanceData.rows[0].elements[0].status === 'OK') {
                        const miles = distanceData.rows[0].elements[0].distance.text.replace(' mi', '').replace(',', '');
                        const destinationAddress = distanceData.destination_addresses[0]; // Extract destination address

                        log.debug('getDistance', `Calculated distance: ${miles} miles.`);
                        log.debug('getDistance', `Destination Address: ${destinationAddress}`);

                        // Store the destination address in the custbody_bas_ship_distance_notes field
                        currentRecord.setValue({
                            fieldId: 'custbody_bas_ship_distance_notes',
                            value: destinationAddress
                        });


                        // Check if the destinationAddress does not include two commas which indicates missing city
                        if ((destinationAddress.match(/,/g) || []).length < 2) {
                            log.error('getDistance', 'Destination address does not include a city based on missing two commas.');

                            // Clear the shipping distance and set error message
                            currentRecord.setValue({
                                fieldId: 'custbody_shipping_distance',
                                value: ''
                            });
                            currentRecord.setValue({
                                fieldId: 'custbody_bas_ship_distance_notes',
                                value: 'Shipping Distance Error, No Valid City'
                            });

                            return null;
                        }

                        return miles;
                    } else {
                        log.error('getDistance', 'Failed to retrieve valid distance data with full address.');
                    }
                } else {
                    log.error('getDistance', `HTTP request failed with status code ${response.code}`);
                }
            } catch (e) {
                log.error('getDistance', `Error: ${e.message}`);
            }

            return null; // Return null if the distance could not be determined
        }

        /**
 * Function to analyze shipping distance and validate ship date conditions.
 *
 * @param {Object} currentRecord - The current record object.
 * @param {string} shipDate - The ship date value.
 * @param {number} shippingDistance - The shipping distance in miles.
 */
        function analyzeDistance(currentRecord, shipDate, shippingDistance) {
            try {
                const dayOfWeek = new Date(shipDate).getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
                log.debug('analyzeDistance', `Day of Week: ${dayOfWeek}`);

                const { isRoleActiveBlackoutDate } = blackoutDatesLib;
                const currentRole = runtime.getCurrentUser().role;

                if (isRoleActiveBlackoutDate({ idRole: currentRole })) {
                    // Monday rule for blackout roles
                    if (dayOfWeek === 1 && shippingDistance > 35) { // 1 = Monday
                        log.debug('analyzeDistance', 'Ship Date is Monday and distance is greater than 35 miles. Clearing ship date.');
                        alert("Delivery distance on Monday is limited to 35 miles. The ship date has been cleared.");
                        clearShipDate(currentRecord, null, 'shipdate');
                    }
                    // Existing 70-85 mile rule for blackout roles
                    else if (shippingDistance >= 70 && shippingDistance <= 85) {
                        log.debug('analyzeDistance', 'Shipping distance is between 70 and 85 miles.');
                        if (dayOfWeek === 4) { // 4 = Thursday
                            log.debug('analyzeDistance', 'Ship Date is a Thursday. Displaying alert for conditions.');
                            alert("Please Remember This is Outside of Our Covered Service Area and Will Be Serviced by a 3rd Party. The Following Conditions Must be Met When Scheduling Between 70 - 85 Miles: Mandatory $49.95 Delivery Fee, Additional $199.95 Per Trip Fee (use code LONGR), and Field Measure or VFM is Required");
                        } else {
                            log.debug('analyzeDistance', 'Ship Date is not a Thursday. Clearing ship date.');
                            alert("Delivery distances between 70-85 miles require a Thursday delivery. The ship date has been cleared.");
                            clearShipDate(currentRecord, null, 'shipdate');
                        }
                    }
                    // Existing >85 mile rule for blackout roles
                    else if (shippingDistance > 85) {
                        log.debug('analyzeDistance', 'Shipping distance is greater than 85 miles. Clearing ship date.');
                        alert("Delivery distances greater than 85 miles are not permitted. Your ship date has been cleared.");
                        clearShipDate(currentRecord, null, 'shipdate');
                    } else {
                        log.debug('analyzeDistance', 'Shipping distance is within acceptable range.');
                    }
                } else {
                    // Monday rule for non-blackout roles
                    if (dayOfWeek === 1 && shippingDistance > 35) { // 1 = Monday
                        log.debug('analyzeDistance', 'Ship Date is Monday and distance is greater than 35 miles. Displaying alert but not clearing ship date based on role.');
                        alert("Delivery distance on Monday is limited to 35 miles. Based on your user role, the ship date has not been cleared, but proceed with caution.");
                    }
                    // Existing 70-85 mile rule for non-blackout roles
                    else if (shippingDistance >= 70 && shippingDistance <= 85) {
                        log.debug('analyzeDistance', 'Shipping distance is between 70 and 85 miles.');
                        if (dayOfWeek === 4) { // 4 = Thursday
                            log.debug('analyzeDistance', 'Ship Date is a Thursday. Displaying alert for conditions.');
                            alert("Please Remember This is Outside of Our Covered Service Area and Will Be Serviced by a 3rd Party. The Following Conditions Must be Met When Scheduling Between 70 - 85 Miles: Mandatory $49.95 Delivery Fee, Additional $199.95 Per Trip Fee (use code LONGR), and Field Measure or VFM is Required");
                        } else {
                            log.debug('analyzeDistance', 'Ship Date is not a Thursday. Displaying alert but not clearing ship date based on role.');
                            alert("Delivery distances between 70-85 miles require a Thursday delivery. Based on your user role, the ship date has not been cleared, but proceed with caution.");
                        }
                    }
                    // Existing >85 mile rule for non-blackout roles
                    else if (shippingDistance > 85) {
                        log.debug('analyzeDistance', 'Shipping distance is greater than 85 miles. Displaying alert but not clearing ship date.');
                        alert("Delivery distances greater than 85 miles are not permitted. Based on your user role, the ship date has not been cleared, but proceed with caution.");
                    } else {
                        log.debug('analyzeDistance', 'Shipping distance is within acceptable range.');
                    }
                }
            } catch (e) {
                log.error('Error in analyzeDistance', e);
            }
        }

        /**
         * Helper function to check if a Wells Fargo Financing order contains Kitchen Works cabinet inventory items
         * and set the custbody_kw_materials_order checkbox accordingly. Only processes if terms is Wells Fargo 
         * Financing (ID 8) and the checkbox is not already set to true. Scans item lines for location Kitchen Works
         * (ID 17) and validates if the item's asset account is Inventory - Cabinets (ID 726).
         *
         * @param {Object} currentRecord - The current record object (Sales Order)
         * @returns {void} - No return value, modifies the record directly
         * 
         * @since 2025.2
         */

        function checkWellsFargoKitchenWorks(currentRecord) {
            try {
                log.debug('checkWellsFargoKitchenWorks', 'Starting Wells Fargo Kitchen Works validation');

                // Check if terms is Wells Fargo Financing (ID 8)
                const termsId = currentRecord.getValue('terms');
                log.debug('checkWellsFargoKitchenWorks', `Terms ID: ${termsId}`);

                if (termsId !== '8' && termsId !== 8) {
                    log.debug('checkWellsFargoKitchenWorks', 'Not Wells Fargo Financing, exiting early');
                    return; // Not Wells Fargo Financing, exit early
                }

                // Check if already set to true
                const kwMaterialsOrder = currentRecord.getValue('custbody_kw_materials_order');
                log.debug('checkWellsFargoKitchenWorks', `Current custbody_kw_materials_order value: ${kwMaterialsOrder}`);

                if (kwMaterialsOrder === true) {
                    log.debug('checkWellsFargoKitchenWorks', 'Checkbox already set to true, exiting early');
                    return; // Already true, no need to check
                }

                // Scan items for Kitchen Works + Cabinet inventory
                const lineCount = currentRecord.getLineCount({ sublistId: 'item' });
                log.debug('checkWellsFargoKitchenWorks', `Scanning ${lineCount} item lines`);

                for (let i = 0; i < lineCount; i++) {
                    const locationId = currentRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'location',
                        line: i
                    });

                    log.debug('checkWellsFargoKitchenWorks', `Line ${i + 1}: Location ID = ${locationId}`);

                    // location id 17 = Kitchen Works
                    if (locationId === '17' || locationId === 17) {
                        log.debug('checkWellsFargoKitchenWorks', `Line ${i + 1}: Kitchen Works location found`);

                        const itemId = currentRecord.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'item',
                            line: i
                        });

                        if (itemId) {
                            log.debug('checkWellsFargoKitchenWorks', `Line ${i + 1}: Item ID = ${itemId}, checking asset account`);

                            const itemFields = search.lookupFields({
                                type: search.Type.ITEM,
                                id: itemId,
                                columns: ['assetaccount']
                            });

                            const assetAccountId = itemFields.assetaccount[0]?.value;
                            log.debug('checkWellsFargoKitchenWorks', `Line ${i + 1}: Asset Account ID = ${assetAccountId}`);

                            // asset account id 726 = Inventory - Cabinets
                            if (assetAccountId === '726' || assetAccountId === 726) {
                                log.debug('checkWellsFargoKitchenWorks', `Line ${i + 1}: Cabinet inventory found! Setting custbody_kw_materials_order to true`);
                                currentRecord.setValue({
                                    fieldId: 'custbody_kw_materials_order',
                                    value: true
                                });
                                log.debug('checkWellsFargoKitchenWorks', 'Checkbox successfully set to true, exiting function');
                                return; // Exit early, found what we need
                            } else {
                                log.debug('checkWellsFargoKitchenWorks', `Line ${i + 1}: Kitchen Works location but not cabinet inventory`);
                            }
                        }
                    }
                }

                log.debug('checkWellsFargoKitchenWorks', 'Completed scan - no qualifying Kitchen Works cabinet items found');
            } catch (e) {
                log.error('Error in checkWellsFargoKitchenWorks', e);
            }
        }

        return {
            pageInit,
            fieldChanged,
            postSourcing,
            //sublistChanged,
            // lineInit,
            // validateField,
            validateLine,
            // validateInsert,
            // validateDelete,
            saveRecord
        };

    });
