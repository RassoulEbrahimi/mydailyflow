(function () {
    var theme = localStorage.getItem('myDailyFlow_theme');
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') theme = 'dark';
    document.documentElement.setAttribute('data-theme', theme);
}());
