from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import csv
from threading import Lock
import threading
import ast
import time
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
import psutil
import queue
from concurrent.futures import ThreadPoolExecutor
import logging


MAX_QUERIES=15


# Lock for thread-safe CSV writing
csv_lock = Lock()

def click_element(driver, element):
    """Wait for an element to be clickable, click it, and wait for the Reviews tab to appear."""
    try:
        
        driver.execute_script("arguments[0].scrollIntoView();", element)
        time.sleep(1) 
        WebDriverWait(driver, 5).until(EC.element_to_be_clickable(element)).click()
        time.sleep(1)  # Allow details to load
    except Exception as e:
        print(f"Error while clicking element or waiting for Reviews tab: ")

def click_element_js(driver, element):
    """Click an element using JavaScript to bypass overlays."""
    try:
        # driver.execute_script("arguments[0].scrollIntoView();", element)
        
        driver.execute_script("arguments[0].click();", element)
    except Exception as e:
        print(f"JavaScript click failed: ")


def handle_reviews(driver):
    latest_review_date = "No review date"
    max_retries = 3
    retry_delay = 1.5  # Increased delay between retries
    time.sleep(1)
    try:
        review_buttons = driver.find_element(By.XPATH, "//button[contains(@aria-label, 'Reviews')]")
        
        review_buttons.click()
                # time.sleep(retry_delay * (attempt+1))

        # Phase 2: Sorting interaction with hybrid waits
        sorting_success = False
        for attempt in range(max_retries+1):
            try:
                
                
                # Get fresh sort button reference
                sort_button = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, 
                        "//button[contains(@aria-label, 'Sort reviews') or contains(@aria-label, 'Most relevant')]"))
                )
                
                # Scroll and click with visual verification
                
                time.sleep(1)  # Allow for smooth scrolling
                sort_button.click()
                sorting_success = True
                break
                
            except Exception as e:
                if attempt == max_retries:
                    raise
                time.sleep(retry_delay * (attempt+1))

        if not sorting_success:
            return latest_review_date

        # Phase 3: Select newest with multiple fallback strategies
        newest_selectors = [
            "//div[contains(text(), 'Newest')]",  # Primary selector
            "//div[contains(text(), 'Newest')]",  # Fallback 1
            "//div[@role='menuitemradio' and contains(.//text(), 'Newest')]"  # Fallback 2
        ]
        
        for selector in newest_selectors:
            try:
                time.sleep(0.3)  
                newest_option = driver.find_element(By.XPATH, selector)
                driver.execute_script("arguments[0].click();", newest_option)
                break
            except Exception as e:
                # print(f"Newest selector failed:")
                time.sleep(0.3)
                newest_option = driver.find_element(By.XPATH, selector)
                newest_option.click()
                
        else:
            print("All newest selectors failed")
            return latest_review_date
        try:
            # Phase 4: Wait for review list stabilization
            WebDriverWait(driver, 15).until(
                lambda d: d.find_element(By.XPATH, 
                    "//div[contains(@class, 'jJc9Ad')][1]//span[contains(@class, 'rsqaWe') or contains(@class, 'xRkPPb')]")
            )
        except Exception as e:
            time.sleep(0.3)
            lambda d: d.find_element(By.XPATH, 
                    "//div[contains(@class, 'jJc9Ad')][1]//span[contains(@class, 'rsqaWe') or contains(@class, 'xRkPPb')]")

        # Phase 5: Date extraction with multiple fallbacks
        date_selectors = [
            "//span[contains(@class, 'rsqaWe') or contains(@class, 'xRkPPb')][1]",
              "//span[contains(@class, 'rsqaWe') or contains(@class, 'xRkPPb')][1]"  # Primary
            "//div[contains(text(), 'ago')][1]",
              "//div[contains(text(), 'ago')][1]"  # Relative time
            
        ]
        
        for selector in date_selectors:
            try:
                date_element = WebDriverWait(driver, 3).until(
                    EC.visibility_of_element_located((By.XPATH, selector))
                )
                latest_review_date = date_element.text.strip()
                break
            except Exception as e:
                print(f"Date selector failed: {selector} ")
                time.sleep(1)

    except Exception as e:
        print(f"Critical review handling failure: ")
    
    return latest_review_date

def scrape_google_maps(search_query, result_queue):
    print("Processing Query: ",search_query)
    chrome_options = webdriver.ChromeOptions()
    # chrome_options.add_argument("--enable-gpu")  # Enable GPU acceleration
    # chrome_options.add_argument("--ignore-gpu-black  list")  # Ignore GPU blocklist to for
    # chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    # chrome_options.add_argument("--disable-dev-shm-usage")
    # chrome_options.add_argument("--disable-gpu")
    
    chrome_options.add_argument("--disable-software-rasterizer")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-logging")
    chrome_options.add_argument("--log-level=3")
    chrome_options.add_argument("--output=/dev/null")
    chrome_options.add_argument("--force-device-scale-factor=0.8")

    chrome_options.add_argument("--single-process")
    driver = webdriver.Chrome(service=Service("C:\\chromedriver.exe"), options=chrome_options)

    business_type, search_query = ast.literal_eval(search_query)
    visited_names = set()
    leads = []
    try:
        driver.get("https://www.google.com/maps")
        # try:
        #     WebDriverWait(driver, 50).until(EC.presence_of_element_located((By.ID, "searchboxinput")))
        # except TimeoutException:
        #     print("Failed to load Google Maps search box. Retrying...")
        try:
            WebDriverWait(driver, 50).until(
                EC.presence_of_element_located((By.NAME, "q"))
            )
            # print("Google Maps search box loaded")
        except TimeoutException:
            print("Failed to load Google Maps search box. Retrying...")
            driver.refresh()
            WebDriverWait(driver, 50).until(EC.presence_of_element_located((By.NAME, "q")))
        search_box = driver.find_element(By.NAME, "q")
        for char in search_query:
            search_box.send_keys(char)
            time.sleep(0.05)
        search_box.send_keys(Keys.ENTER)

        max_retries = 3
        retry_delay = 5
        for attempt in range(max_retries):
            try:
                WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.CLASS_NAME, "Nv2PK")))
                break
            except TimeoutException:
                if attempt == max_retries - 1:
                    print(f"Failed to locate results after {max_retries} attempts. Skipping query: {search_query}")
                    return
                print(f"Retrying to locate results... Attempt {attempt + 1}/{max_retries}")
                time.sleep(retry_delay)
        actions = ActionChains(driver)
        businesses = []
        count = 0

        prev_count = 0
        no_change_count = 0  # Track how many times results remain unchanged

        while True:
            actions.send_keys(Keys.PAGE_DOWN).perform()
            time.sleep(2)  # Allow time for new results to load

            results = driver.find_elements(By.CLASS_NAME, "Nv2PK")
            current_count = len(results)

            if current_count == prev_count:
                no_change_count += 1
            else:
                no_change_count = 0  # Reset counter if new results appear

            if no_change_count >= 2:  # If no new results appear after 3 scrolls, stop
                print("No new results found after scrolling. Ending search.")
                break

            prev_count = current_count

            if count >= MAX_QUERIES:
                print("Reached maximum limit of queries. Stopping search.")
                break

            results = driver.find_elements(By.CLASS_NAME, "Nv2PK")
            for result in results:
                try:
                    rating = "No rating"
                    address = "No address"
                    phone = "No phone number"
                    category = "No category"
                    website = "No website"
                    latest_review_date = "No review date"
                    reviews = "No reviews"
                    
                    name_element = result.find_element(By.CLASS_NAME, "qBF1Pd")
                    name = name_element.text if name_element else "No name"
                    if name in visited_names:
                        continue
                    
                    if(count>=MAX_QUERIES):
                        break
                    count+=1
                    visited_names.add(name)
                    click_element(driver, result)
                    button = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[contains(@aria-label, 'Reviews')]")))
                    if not button:
                        continue
                        
                    detail_soup = BeautifulSoup(driver.page_source, 'html.parser')
                    # Extract review count and rating
                    try:
                        review_element = result.find_element(By.CLASS_NAME, "UY7F9")
                        reviews = review_element.text if review_element else "No reviews"
                    except:
                        reviews = "No reviews"

                    try:
                        rating_element = result.find_element(By.CLASS_NAME, "MW4etd")
                        rating = rating_element.text if rating_element else "No ratings"
                    except:
                        rating = "No ratings"

                    reviews = reviews.replace('(', '').replace(')', '')
                    
                    # Extract address
                    address_element = detail_soup.find('div', class_='Io6YTe')
                    if address_element:
                        address = address_element.text.strip()
                        
                    if address=='No address':
                        address_element=driver.find_element(By.XPATH, 
                            "//div[contains(@class, 'Io6YTe ') and contains(@class, 'fontBodyMedium ') and contains(text(), 'United')]")
                        if address_element:
                            address = address_element.text.strip()

                    # Extract phone number
                    phone_elements = detail_soup.find_all('div', class_='Io6YTe')
                    for div in phone_elements:
                        if div.text.startswith('+') or div.text.replace('-', '').isdigit():
                            phone = div.text.strip()
                            break
                    
                    if phone=='No phone number':
                        phone_element=driver.find_element(By.XPATH, 
                            "//div[contains(@class, 'Io6YTe ') and contains(@class, 'fontBodyMedium ') and contains(text(), '+1')]")
                        if phone_element:
                            phone = phone_element.text.strip()   
                    # Extract category (Primary Method)
                    try:
                        category_div = detail_soup.find('button', class_='DkEaL')
                        if category_div:
                            category = category_div.text.strip()
                    except:
                        print("Couldnt find Category")
                    
                    if category == "No category":
                        try:
                            category_div =driver.find_element(By.XPATH, "//button[contains(@class, 'DkEaL')]")
                            if category_div:
                                category = category_div.text.strip()
                        except:
                            print("Couldnt find Category")
                    if category == "No category":
                        try:
                            category_div =driver.find_element(By.XPATH, "//span[contains(@class, 'mgr77e')]//span[contains(text(), 'star')]")
                            if category_div:
                                category = category_div.text.strip()
                        except:
                            print("Couldnt find Category")
                    
                    
                    
                    
                    

                    # Extract website
                    
                    website_div = detail_soup.find('div', class_='rogA2c ITvuef')
                    if website_div:
                        website_inner_div = website_div.find('div')
                        if website_inner_div:
                            website = website_inner_div.text.strip()
                    
                    
                        if website=='No website':
                            try:
                                site = driver.find_element(By.XPATH, 
                                    "//div[contains(@class, 'Io6YTe') and contains(@class, 'fontBodyMedium') and "
                                    "(contains(text(), '.gov') or contains(text(), '.org') or contains(text(), '.edu') or contains(text(), '.com') or contains(text(), '.net'))]"
                                    )
                                if site:
                                    website = site.text.strip() 
                            except:
                                print('Error in finding Second Website Method')
                                
                                
                    latest_review_date = handle_reviews(driver)                        
                                
                    leads.append({
                        'Type of Business': business_type,
                        'Sub-Category': category,
                        'Name of Business': name,
                        'Website': website,
                        '# of Reviews': reviews,
                        'Rating': rating,
                        'Latest Review Date': latest_review_date,
                        'Business Address': address,
                        'Phone Number': phone
                    })

                except Exception as e:
                    print("")
        # Write all leads for this query to CSV
        with csv_lock:
            with open(output_file, mode='a', newline='', encoding='utf-8') as file:
                writer = csv.DictWriter(file, fieldnames=[
                    'Type of Business', 'Sub-Category', 'Name of Business', 'Website',
                    '# of Reviews', 'Rating', 'Latest Review Date', 'Business Address', 'Phone Number'
                ])
                if file.tell() == 0:  # Write header only if the file is empty
                    writer.writeheader()
                writer.writerows(leads)

    except Exception as e:
            # Log any unexpected errors during the scraping process
            print(f"Unexpected error while processing query '{search_query}'")
            logging.error(f"Unexpected error while processing query '{search_query}'")
    
    finally:
        # Ensure the driver is always closed
        driver.quit()
        
        
def process_queries(queries, result_queue, output_file):
    """
    Processes a batch of queries using multithreading.
    """
    with ThreadPoolExecutor(max_workers=3) as excutor:
        futures = [excutor.submit(scrape_google_maps, query, result_queue) for query in queries]

        for future in futures:
            try:
                future.result()  # Wait for each thread to complete
            except Exception as e:
                logging.error(f"Thread failed: {e}")
if __name__ == "__main__":
    input_file = "queries.txt"
    output_file = "./Outputs/LeadsApart.csv"

    with open(input_file, mode='r', encoding='utf-8') as file:
        queries = []
        for line in file:
            line = line.strip()
            if not line:
                continue

            business_type, search_query = ast.literal_eval(line)

            # Append US if not already present
            if not search_query.strip().lower().endswith("us"):
                search_query = search_query.strip() + " US"

            queries.append(str((business_type, search_query)))

    result_queue = queue.Queue()
    process_queries(queries, result_queue, output_file)