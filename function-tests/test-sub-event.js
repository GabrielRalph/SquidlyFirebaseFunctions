const { onSubscriptionEvent } = require("../functions/Licences/Stripe/billing")

const SubscriptionUpdate = [{
  "id": "evt_1RuOjKJtbjnkj6ggUmqODfJP",
  "object": "event",
  "api_version": "2025-01-27.acacia",
  "created": 1754791885,
  "data": {
    "object": {
      "id": "sub_1Ru8kzJtbjnkj6ggRcPQYLwG",
      "object": "subscription",
      "application": null,
      "application_fee_percent": null,
      "automatic_tax": {
        "disabled_reason": null,
        "enabled": false,
        "liability": null
      },
      "billing_cycle_anchor": 1754791883,
      "billing_cycle_anchor_config": null,
      "billing_mode": {
        "type": "classic"
      },
      "billing_thresholds": null,
      "cancel_at": null,
      "cancel_at_period_end": false,
      "canceled_at": null,
      "cancellation_details": {
        "comment": null,
        "feedback": null,
        "reason": null
      },
      "collection_method": "charge_automatically",
      "created": 1754730485,
      "currency": "aud",
      "current_period_end": 1757470283,
      "current_period_start": 1754791883,
      "customer": "cus_SpoJGOcmbC0uC5",
      "days_until_due": null,
      "default_payment_method": "pm_1Ru8kxJtbjnkj6ggTAIu1tUL",
      "default_source": null,
      "default_tax_rates": [],
      "description": null,
      "discount": null,
      "discounts": [],
      "ended_at": null,
      "invoice_settings": {
        "account_tax_ids": null,
        "issuer": {
          "type": "self"
        }
      },
      "items": {
        "object": "list",
        "data": [
          {
            "id": "si_SpoNACj18Cl7HM",
            "object": "subscription_item",
            "billing_thresholds": null,
            "created": 1754730486,
            "current_period_end": 1757470283,
            "current_period_start": 1754791883,
            "discounts": [],
            "metadata": {},
            "plan": {
              "id": "price_1Qu91JJtbjnkj6ggTzuQMtuQ",
              "object": "plan",
              "active": true,
              "aggregate_usage": null,
              "amount": 3500,
              "amount_decimal": "3500",
              "billing_scheme": "per_unit",
              "created": 1739955161,
              "currency": "aud",
              "interval": "month",
              "interval_count": 1,
              "livemode": false,
              "metadata": {
                "tier": "Pro"
              },
              "meter": null,
              "nickname": null,
              "product": "prod_RnkW23ByAbNqkL",
              "tiers_mode": null,
              "transform_usage": null,
              "trial_period_days": null,
              "usage_type": "licensed"
            },
            "price": {
              "id": "price_1Qu91JJtbjnkj6ggTzuQMtuQ",
              "object": "price",
              "active": true,
              "billing_scheme": "per_unit",
              "created": 1739955161,
              "currency": "aud",
              "custom_unit_amount": null,
              "livemode": false,
              "lookup_key": "pro-monthly",
              "metadata": {
                "tier": "Pro"
              },
              "nickname": null,
              "product": "prod_RnkW23ByAbNqkL",
              "recurring": {
                "aggregate_usage": null,
                "interval": "month",
                "interval_count": 1,
                "meter": null,
                "trial_period_days": null,
                "usage_type": "licensed"
              },
              "tax_behavior": "unspecified",
              "tiers_mode": null,
              "transform_quantity": null,
              "type": "recurring",
              "unit_amount": 3500,
              "unit_amount_decimal": "3500"
            },
            "quantity": 5,
            "subscription": "sub_1Ru8kzJtbjnkj6ggRcPQYLwG",
            "tax_rates": []
          }
        ],
        "has_more": false,
        "total_count": 1,
        "url": "/v1/subscription_items?subscription=sub_1Ru8kzJtbjnkj6ggRcPQYLwG"
      },
      "latest_invoice": "in_1RuOjHJtbjnkj6gg9ajEmnZz",
      "livemode": false,
      "metadata": {},
      "next_pending_invoice_item_invoice": null,
      "on_behalf_of": null,
      "pause_collection": null,
      "payment_settings": {
        "payment_method_options": {
          "acss_debit": null,
          "bancontact": null,
          "card": {
            "network": null,
            "request_three_d_secure": "automatic"
          },
          "customer_balance": null,
          "konbini": null,
          "sepa_debit": null,
          "us_bank_account": null
        },
        "payment_method_types": [
          "card"
        ],
        "save_default_payment_method": "off"
      },
      "pending_invoice_item_interval": null,
      "pending_setup_intent": null,
      "pending_update": null,
      "plan": {
        "id": "price_1Qu91JJtbjnkj6ggTzuQMtuQ",
        "object": "plan",
        "active": true,
        "aggregate_usage": null,
        "amount": 3500,
        "amount_decimal": "3500",
        "billing_scheme": "per_unit",
        "created": 1739955161,
        "currency": "aud",
        "interval": "month",
        "interval_count": 1,
        "livemode": false,
        "metadata": {
          "tier": "Pro"
        },
        "meter": null,
        "nickname": null,
        "product": "prod_RnkW23ByAbNqkL",
        "tiers_mode": null,
        "transform_usage": null,
        "trial_period_days": null,
        "usage_type": "licensed"
      },
      "quantity": 5,
      "schedule": null,
      "start_date": 1754730485,
      "status": "active",
      "test_clock": null,
      "transfer_data": null,
      "trial_end": 1754791882,
      "trial_settings": {
        "end_behavior": {
          "missing_payment_method": "create_invoice"
        }
      },
      "trial_start": 1754730485
    },
    "previous_attributes": {
      "billing_cycle_anchor": 1755335285,
      "current_period_end": 1755335285,
      "current_period_start": 1754730485,
      "items": {
        "data": [
          {
            "id": "si_SpoNACj18Cl7HM",
            "object": "subscription_item",
            "billing_thresholds": null,
            "created": 1754730486,
            "current_period_end": 1755335285,
            "current_period_start": 1754730485,
            "discounts": [],
            "metadata": {},
            "plan": {
              "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
              "object": "plan",
              "active": true,
              "aggregate_usage": null,
              "amount": 2000,
              "amount_decimal": "2000",
              "billing_scheme": "per_unit",
              "created": 1751085438,
              "currency": "aud",
              "interval": "month",
              "interval_count": 1,
              "livemode": false,
              "metadata": {},
              "meter": null,
              "nickname": "Squidly Essentials billed monthly",
              "product": "prod_Sa0WvLHj1xb3F0",
              "tiers_mode": null,
              "transform_usage": null,
              "trial_period_days": null,
              "usage_type": "licensed"
            },
            "price": {
              "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
              "object": "price",
              "active": true,
              "billing_scheme": "per_unit",
              "created": 1751085438,
              "currency": "aud",
              "custom_unit_amount": null,
              "livemode": false,
              "lookup_key": "essentials-monthly",
              "metadata": {},
              "nickname": "Squidly Essentials billed monthly",
              "product": "prod_Sa0WvLHj1xb3F0",
              "recurring": {
                "aggregate_usage": null,
                "interval": "month",
                "interval_count": 1,
                "meter": null,
                "trial_period_days": null,
                "usage_type": "licensed"
              },
              "tax_behavior": "unspecified",
              "tiers_mode": null,
              "transform_quantity": null,
              "type": "recurring",
              "unit_amount": 2000,
              "unit_amount_decimal": "2000"
            },
            "quantity": 1,
            "subscription": "sub_1Ru8kzJtbjnkj6ggRcPQYLwG",
            "tax_rates": []
          }
        ]
      },
      "latest_invoice": "in_1Ru8kzJtbjnkj6ggpWLCGFQ3",
      "plan": {
        "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
        "amount": 2000,
        "amount_decimal": "2000",
        "created": 1751085438,
        "metadata": {
          "tier": null
        },
        "nickname": "Squidly Essentials billed monthly",
        "product": "prod_Sa0WvLHj1xb3F0"
      },
      "quantity": 1,
      "status": "canceled",
      "trial_end": 1755335285
    }
  },
  "livemode": false,
  "pending_webhooks": 1,
  "request": {
    "id": null,
    "idempotency_key": "42e626c1-05c5-4985-b9cb-b55da30c9305"
  },
  "type": "customer.subscription.updated"
}]
const SubscriptionCreationEvents = [
    {
        "id": "evt_1RuVdlJtbjnkj6gg6clDIg2k",
        "object": "event",
        "api_version": "2025-01-27.acacia",
        "created": 1754818446,
        "data": {
            "object": {
            "id": "sub_1RuVdhJtbjnkj6gg6a4yISk8",
            "object": "subscription",
            "application": null,
            "application_fee_percent": null,
            "automatic_tax": {
                "disabled_reason": null,
                "enabled": false,
                "liability": null
            },
            "billing_cycle_anchor": 1754818445,
            "billing_cycle_anchor_config": null,
            "billing_mode": {
                "type": "classic"
            },
            "billing_thresholds": null,
            "cancel_at": null,
            "cancel_at_period_end": false,
            "canceled_at": null,
            "cancellation_details": {
                "comment": null,
                "feedback": null,
                "reason": null
            },
            "collection_method": "charge_automatically",
            "created": 1754818445,
            "currency": "aud",
            "current_period_end": 1757496845,
            "current_period_start": 1754818445,
            "customer": "cus_SqC0SrlDRtABBD",
            "days_until_due": null,
            "default_payment_method": null,
            "default_source": null,
            "default_tax_rates": [],
            "description": null,
            "discount": null,
            "discounts": [],
            "ended_at": null,
            "invoice_settings": {
                "account_tax_ids": null,
                "issuer": {
                "type": "self"
                }
            },
            "items": {
                "object": "list",
                "data": [
                {
                    "id": "si_SqC1Z4pXrCgKaF",
                    "object": "subscription_item",
                    "billing_thresholds": null,
                    "created": 1754818446,
                    "current_period_end": 1757496845,
                    "current_period_start": 1754818445,
                    "discounts": [],
                    "metadata": {},
                    "plan": {
                    "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
                    "object": "plan",
                    "active": true,
                    "aggregate_usage": null,
                    "amount": 2000,
                    "amount_decimal": "2000",
                    "billing_scheme": "per_unit",
                    "created": 1751085438,
                    "currency": "aud",
                    "interval": "month",
                    "interval_count": 1,
                    "livemode": false,
                    "metadata": {},
                    "meter": null,
                    "nickname": "Squidly Essentials billed monthly",
                    "product": "prod_Sa0WvLHj1xb3F0",
                    "tiers_mode": null,
                    "transform_usage": null,
                    "trial_period_days": null,
                    "usage_type": "licensed"
                    },
                    "price": {
                    "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
                    "object": "price",
                    "active": true,
                    "billing_scheme": "per_unit",
                    "created": 1751085438,
                    "currency": "aud",
                    "custom_unit_amount": null,
                    "livemode": false,
                    "lookup_key": "essentials-monthly",
                    "metadata": {},
                    "nickname": "Squidly Essentials billed monthly",
                    "product": "prod_Sa0WvLHj1xb3F0",
                    "recurring": {
                        "aggregate_usage": null,
                        "interval": "month",
                        "interval_count": 1,
                        "meter": null,
                        "trial_period_days": null,
                        "usage_type": "licensed"
                    },
                    "tax_behavior": "unspecified",
                    "tiers_mode": null,
                    "transform_quantity": null,
                    "type": "recurring",
                    "unit_amount": 2000,
                    "unit_amount_decimal": "2000"
                    },
                    "quantity": 1,
                    "subscription": "sub_1RuVdhJtbjnkj6gg6a4yISk8",
                    "tax_rates": []
                }
                ],
                "has_more": false,
                "total_count": 1,
                "url": "/v1/subscription_items?subscription=sub_1RuVdhJtbjnkj6gg6a4yISk8"
            },
            "latest_invoice": "in_1RuVdhJtbjnkj6gg6nIxtoOg",
            "livemode": false,
            "metadata": {},
            "next_pending_invoice_item_invoice": null,
            "on_behalf_of": null,
            "pause_collection": null,
            "payment_settings": {
                "payment_method_options": {
                "acss_debit": null,
                "bancontact": null,
                "card": {
                    "network": null,
                    "request_three_d_secure": "automatic"
                },
                "customer_balance": null,
                "konbini": null,
                "sepa_debit": null,
                "us_bank_account": null
                },
                "payment_method_types": [
                "card"
                ],
                "save_default_payment_method": "off"
            },
            "pending_invoice_item_interval": null,
            "pending_setup_intent": null,
            "pending_update": null,
            "plan": {
                "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
                "object": "plan",
                "active": true,
                "aggregate_usage": null,
                "amount": 2000,
                "amount_decimal": "2000",
                "billing_scheme": "per_unit",
                "created": 1751085438,
                "currency": "aud",
                "interval": "month",
                "interval_count": 1,
                "livemode": false,
                "metadata": {},
                "meter": null,
                "nickname": "Squidly Essentials billed monthly",
                "product": "prod_Sa0WvLHj1xb3F0",
                "tiers_mode": null,
                "transform_usage": null,
                "trial_period_days": null,
                "usage_type": "licensed"
            },
            "quantity": 1,
            "schedule": null,
            "start_date": 1754818445,
            "status": "incomplete",
            "test_clock": null,
            "transfer_data": null,
            "trial_end": null,
            "trial_settings": {
                "end_behavior": {
                "missing_payment_method": "create_invoice"
                }
            },
            "trial_start": null
            }
        },
        "livemode": false,
        "pending_webhooks": 1,
        "request": {
            "id": null,
            "idempotency_key": "460fc15b-00a1-4430-8534-79c0afc71ab7"
        },
        "type": "customer.subscription.created"
    },

    {
        "id": "evt_1RuVdlJtbjnkj6ggwajT30WH",
        "object": "event",
        "api_version": "2025-01-27.acacia",
        "created": 1754818448,
        "data": {
            "object": {
            "id": "sub_1RuVdhJtbjnkj6gg6a4yISk8",
            "object": "subscription",
            "application": null,
            "application_fee_percent": null,
            "automatic_tax": {
                "disabled_reason": null,
                "enabled": false,
                "liability": null
            },
            "billing_cycle_anchor": 1754818445,
            "billing_cycle_anchor_config": null,
            "billing_mode": {
                "type": "classic"
            },
            "billing_thresholds": null,
            "cancel_at": null,
            "cancel_at_period_end": false,
            "canceled_at": null,
            "cancellation_details": {
                "comment": null,
                "feedback": null,
                "reason": null
            },
            "collection_method": "charge_automatically",
            "created": 1754818445,
            "currency": "aud",
            "current_period_end": 1757496845,
            "current_period_start": 1754818445,
            "customer": "cus_SqC0SrlDRtABBD",
            "days_until_due": null,
            "default_payment_method": "pm_1RuVdgJtbjnkj6gg3HJmb9To",
            "default_source": null,
            "default_tax_rates": [],
            "description": null,
            "discount": null,
            "discounts": [],
            "ended_at": null,
            "invoice_settings": {
                "account_tax_ids": null,
                "issuer": {
                "type": "self"
                }
            },
            "items": {
                "object": "list",
                "data": [
                {
                    "id": "si_SqC1Z4pXrCgKaF",
                    "object": "subscription_item",
                    "billing_thresholds": null,
                    "created": 1754818446,
                    "current_period_end": 1757496845,
                    "current_period_start": 1754818445,
                    "discounts": [],
                    "metadata": {},
                    "plan": {
                    "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
                    "object": "plan",
                    "active": true,
                    "aggregate_usage": null,
                    "amount": 2000,
                    "amount_decimal": "2000",
                    "billing_scheme": "per_unit",
                    "created": 1751085438,
                    "currency": "aud",
                    "interval": "month",
                    "interval_count": 1,
                    "livemode": false,
                    "metadata": {},
                    "meter": null,
                    "nickname": "Squidly Essentials billed monthly",
                    "product": "prod_Sa0WvLHj1xb3F0",
                    "tiers_mode": null,
                    "transform_usage": null,
                    "trial_period_days": null,
                    "usage_type": "licensed"
                    },
                    "price": {
                    "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
                    "object": "price",
                    "active": true,
                    "billing_scheme": "per_unit",
                    "created": 1751085438,
                    "currency": "aud",
                    "custom_unit_amount": null,
                    "livemode": false,
                    "lookup_key": "essentials-monthly",
                    "metadata": {},
                    "nickname": "Squidly Essentials billed monthly",
                    "product": "prod_Sa0WvLHj1xb3F0",
                    "recurring": {
                        "aggregate_usage": null,
                        "interval": "month",
                        "interval_count": 1,
                        "meter": null,
                        "trial_period_days": null,
                        "usage_type": "licensed"
                    },
                    "tax_behavior": "unspecified",
                    "tiers_mode": null,
                    "transform_quantity": null,
                    "type": "recurring",
                    "unit_amount": 2000,
                    "unit_amount_decimal": "2000"
                    },
                    "quantity": 1,
                    "subscription": "sub_1RuVdhJtbjnkj6gg6a4yISk8",
                    "tax_rates": []
                }
                ],
                "has_more": false,
                "total_count": 1,
                "url": "/v1/subscription_items?subscription=sub_1RuVdhJtbjnkj6gg6a4yISk8"
            },
            "latest_invoice": "in_1RuVdhJtbjnkj6gg6nIxtoOg",
            "livemode": false,
            "metadata": {},
            "next_pending_invoice_item_invoice": null,
            "on_behalf_of": null,
            "pause_collection": null,
            "payment_settings": {
                "payment_method_options": {
                "acss_debit": null,
                "bancontact": null,
                "card": {
                    "network": null,
                    "request_three_d_secure": "automatic"
                },
                "customer_balance": null,
                "konbini": null,
                "sepa_debit": null,
                "us_bank_account": null
                },
                "payment_method_types": [
                "card"
                ],
                "save_default_payment_method": "off"
            },
            "pending_invoice_item_interval": null,
            "pending_setup_intent": null,
            "pending_update": null,
            "plan": {
                "id": "price_1ReqVuJtbjnkj6ggfvFx3oaR",
                "object": "plan",
                "active": true,
                "aggregate_usage": null,
                "amount": 2000,
                "amount_decimal": "2000",
                "billing_scheme": "per_unit",
                "created": 1751085438,
                "currency": "aud",
                "interval": "month",
                "interval_count": 1,
                "livemode": false,
                "metadata": {},
                "meter": null,
                "nickname": "Squidly Essentials billed monthly",
                "product": "prod_Sa0WvLHj1xb3F0",
                "tiers_mode": null,
                "transform_usage": null,
                "trial_period_days": null,
                "usage_type": "licensed"
            },
            "quantity": 1,
            "schedule": null,
            "start_date": 1754818445,
            "status": "active",
            "test_clock": null,
            "transfer_data": null,
            "trial_end": null,
            "trial_settings": {
                "end_behavior": {
                "missing_payment_method": "create_invoice"
                }
            },
            "trial_start": null
            },
            "previous_attributes": {
            "default_payment_method": null,
            "status": "incomplete"
            }
        },
        "livemode": false,
        "pending_webhooks": 1,
        "request": {
            "id": null,
            "idempotency_key": "460fc15b-00a1-4430-8534-79c0afc71ab7"
        },
        "type": "customer.subscription.updated"
        }
]

Promise.all(SubscriptionCreationEvents.map(event => onSubscriptionEvent(event.data.object, true))).then(result => {
    console.log("Subscription event processed successfully:", result);
  })
  .catch(error => {
    console.error("Error processing subscription event:", error);
  }
).finally(() => {
  console.log("Subscription event processing completed.");
  process.exit(0);
});

