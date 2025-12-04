import { jwtDecode } from 'jwt-decode';
import libphonenumber from "google-libphonenumber";

export const isTokenValid = (token: string) => {
    if (!token) {
        return 'INVALID';
    }
    try {
        const decodedToken: { exp: number } = jwtDecode(token);
        const expirationTimestamp = decodedToken.exp;
        if (typeof expirationTimestamp !== 'number') {
            return 'INVALID';
        }
        const currentTimestamp = Math.floor(Date.now() / 1000);
        return expirationTimestamp > currentTimestamp ? true : 'EXPIRED';
    } catch (e) {
        console.log("Error in isTokenValid:", e);
        return 'INVALID'
    }
}

export const validatePhoneNumber = (phoneNumber: string) => {
    const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance();
    try {
        const parsedNumber = phoneUtil.parseAndKeepRawInput(phoneNumber);
        return phoneUtil.isValidNumber(parsedNumber);
    } catch (error) {
        console.log("Error while validating phonenumber as", error);
        return false;
    }
};

export const SessionType = {
    Incoming: "Incoming" as const,
    Outgoing: "Outgoing" as const,
}