"""Amazon Subscriptions Audit Tool.

CLI companion and audit tool for Amazon Subscribe & Save subscriptions.
"""

import sys
import argparse


def audit_subscriptions():
    """Audit active Amazon subscriptions."""
    print("Amazon Subscriptions Audit Tool")
    print("=" * 40)
    print("Navigate to: https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions")
    print("Use the companion Chrome extension or review active subscriptions in browser.")


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Audit and manage Amazon Subscribe & Save subscriptions"
    )
    parser.add_argument(
        "--status", action="store_true", help="Print audit status instructions"
    )
    args = parser.parse_args()
    audit_subscriptions()


if __name__ == "__main__":
    main()
