import requests

def get_id_level_base(ID):
    url = f"https://api.checklistbank.org/dataset/313100/tree/{ID}/children?limit=1000&offset=0&type=project&insertPlaceholder=true"
    response = requests.get(url)
    try :
        return response.json()["result"]
    except:
        return []

for item in get_id_level_base("F"):
    if item['name'] == "Not assigned":
        continue
    else:
        print(f"ID: {item['id']} Name: {item['name']}")
        for subitem in get_id_level_base(item['id']):
            if subitem['name'] == "Not assigned":
                continue
            else:
                print(f"\tID: {subitem['id']} Name: {subitem['name']}")
                for subsubitem in get_id_level_base(subitem['id']):
                    if subsubitem['name'] == "Not assigned":
                        continue
                    else:
                        print(f"\t\tID: {subsubitem['id']} Name: {subsubitem['name']}")
                    
        
            

    
