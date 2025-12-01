class BaseException extends Error {
    source: string;
    details?: string;
    constructor(name: string, source: string, message?: string) {
        super(message);
        this.name = name;
        this.source = source;
    }
}

export class MissingParameterException extends BaseException {
    constructor(source: string, paramList: string[]) {
        super('MissingParameterException', source, `Missing required parameters.`);
        this.details = JSON.stringify({ requiredParameters: [...paramList] });
    }
}

export class InvalidValueException extends BaseException {
    constructor(source: string, param: string, invalidValue: any, validValues?: any[]) {
        super('InvalidValueException', source, `Invalid value provided for parameter '${param}'.`);
        this.details = JSON.stringify({
            invalidParameter: param,
            invalidValue: invalidValue,
            validValues: validValues,
        });
    }
}

export class UnauthorizedException extends BaseException {
    constructor(source: string, details: string) {
        super('UnauthorizedException', source, `Authentication or permission error.`);
        this.details = JSON.stringify(details);
    }
}

export class InvalidTokenException extends BaseException {
    constructor(source: string, details: 'INVALID' | 'EXPIRED') {
        super('InvalidTokenException', source, `Token is ${details}.`);
        this.details = JSON.stringify(`Token is ${details}`);
    }
}

export class PermissionDeniedException extends BaseException {
    constructor(source: string, details: string) {
        super('PermissionDeniedException', source, 'Permission denied.');
        this.details = JSON.stringify(details);
    }
}

export class UnknownException extends BaseException {
    constructor(source: string, details: string) {
        super('UnknownException', source, 'An unknown error occurred.');
        this.details = JSON.stringify(details);
    }
}