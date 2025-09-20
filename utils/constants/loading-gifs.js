/**
 * Loading GIF Constants
 * Dedicated loading GIFs for music processing - separate from main screen GIFs
 */

// Loading GIFs specifically for music processing/loading states
export const LOADING_GIFS = [
    'https://media.giphy.com/media/IhI6VWW7Fahs6Yeicc/giphy.gif?cid=790b7611a5bf5d2e9ff5b6d09982fcdd20d041d4530f25ed&ep=v1_user_favorites&rid=giphy.gif&ct=g', // Music notes
    'https://media.giphy.com/media/3ohs7TrCSp7c8ZrxBe/giphy.gif?cid=790b7611a5bf5d2e9ff5b6d09982fcdd20d041d4530f25ed&ep=v1_user_favorites&rid=giphy.gif&ct=g', // Music notes (backup)
    'https://media.giphy.com/media/3ohzdOrcdpiD26TPt6/giphy.gif?cid=790b7611a5bf5d2e9ff5b6d09982fcdd20d041d4530f25ed&ep=v1_user_favorites&rid=giphy.gif&ct=g', // Music notes (backup 2)
    'https://media.giphy.com/media/26tPcVAWvlzRQtsLS/giphy.gif?cid=ecf05e47f7983de8546fad7c63a5dba9384069ff286ef529&ep=v1_user_favorites&rid=giphy.gif&ct=g'   // Music notes (backup 3)
];

/**
 * Get a random loading GIF
 * @returns {string} Random loading GIF URL
 */
export function getRandomLoadingGif() {
    const randomIndex = Math.floor(Math.random() * LOADING_GIFS.length);
    return LOADING_GIFS[randomIndex];
}
