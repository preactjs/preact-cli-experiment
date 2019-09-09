export default function isValidName(
	name: string
): {
	validForOldPackages: boolean;
	validForNewPackages: boolean;
	warnings?: string[];
	errors?: string[];
};
